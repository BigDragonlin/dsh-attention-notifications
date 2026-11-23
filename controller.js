import { execFile } from 'node:child_process'
import { basename } from 'node:path'

const NOTIFICATION_SCRIPT = `on run argv
  display notification (item 2 of argv) with title (item 1 of argv) sound name (item 3 of argv)
end run`

const SILENT_NOTIFICATION_SCRIPT = `on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run`

/**
 * Create the event handlers and owned resources for macOS attention alerts.
 * @param {object} config - validated plugin configuration.
 * @param {object} [dependencies] - process, timer, and logging overrides for tests.
 * @returns event handlers and a disposer.
 */
export function createAttentionController(config, dependencies = {}) {
  const execute = dependencies.execute ?? execFile
  const schedule = dependencies.schedule ?? setTimeout
  const unschedule = dependencies.unschedule ?? clearTimeout
  const logger = dependencies.logger ?? console
  const timers = new Map()
  const lastTurns = new Map()
  const notifiedTurns = new Map()
  const children = new Set()
  let disposed = false

  function eligible(agent) {
    return config.includeSubagents || agent.session.header.origin !== 'subagent'
  }

  function projectLabel(agent) {
    const cwd = agent.session.header.cwd
    return cwd === undefined ? '当前对话' : basename(cwd) || cwd
  }

  function notify(title, body, sound) {
    if (disposed) return
    const script = sound ? NOTIFICATION_SCRIPT : SILENT_NOTIFICATION_SCRIPT
    const args = sound
      ? ['-e', script, title, body, sound]
      : ['-e', script, title, body]
    try {
      const child = execute('/usr/bin/osascript', args, { timeout: config.commandTimeoutMs }, (error) => {
        children.delete(child)
        if (error && !disposed) logger.warn(`[attention-notifications] Notification failed: ${errorMessage(error)}`)
      })
      children.add(child)
    } catch (error) {
      logger.warn(`[attention-notifications] Notification failed: ${errorMessage(error)}`)
    }
  }

  function clearTimer(agentId) {
    const timer = timers.get(agentId)
    if (timer === undefined) return
    unschedule(timer)
    timers.delete(agentId)
  }

  function onSessionEvent(session, event) {
    if (event.type !== 'turn/end') return
    if (!config.includeSubagents && session.header.origin === 'subagent') return
    lastTurns.set(session.id, { turn: event.data.turn, reason: event.data.reason })
  }

  function onAgentStatus({ agent, status }) {
    clearTimer(agent.id)
    if (status !== 'idle' || !config.onComplete || !eligible(agent)) return
    const latest = lastTurns.get(agent.id)
    if (latest === undefined || latest.reason.kind === 'aborted' || notifiedTurns.get(agent.id) === latest.turn) return
    const timer = schedule(() => {
      timers.delete(agent.id)
      if (disposed || agent.status !== 'idle') return
      notifiedTurns.set(agent.id, latest.turn)
      const message = completionMessage(latest.reason.kind)
      notify('DeepSeek Harness', `${projectLabel(agent)}：${message}`, config.completionSound)
    }, config.completionDelayMs)
    timers.set(agent.id, timer)
  }

  function onAgentDisposed({ agent }) {
    clearTimer(agent.id)
    lastTurns.delete(agent.id)
    notifiedTurns.delete(agent.id)
  }

  async function onApproval(request, next) {
    if (config.onApproval && eligible(request.agent)) {
      notify(
        'DeepSeek Harness 等待操作',
        `${projectLabel(request.agent)}：需要审批“${request.toolName}”。`,
        config.attentionSound,
      )
    }
    return await next()
  }

  async function onQuestion(request, next) {
    if (config.onQuestion && request.agent !== undefined && eligible(request.agent)) {
      notify(
        'DeepSeek Harness 等待操作',
        `${projectLabel(request.agent)}：有问题等待你回答。`,
        config.attentionSound,
      )
    }
    return await next()
  }

  function dispose() {
    disposed = true
    for (const timer of timers.values()) unschedule(timer)
    timers.clear()
    lastTurns.clear()
    notifiedTurns.clear()
    for (const child of children) child.kill()
    children.clear()
  }

  return { onSessionEvent, onAgentStatus, onAgentDisposed, onApproval, onQuestion, dispose }
}

function completionMessage(kind) {
  switch (kind) {
    case 'completed': return '任务已完成，可以查看结果。'
    case 'blocked': return '任务已暂停，需要你的处理。'
    case 'error': return '任务因错误结束，请查看详情。'
    case 'max-tokens': return '输出达到长度上限，请查看结果。'
    default: return '任务已结束，可以查看结果。'
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
