import assert from 'node:assert/strict'
import test from 'node:test'
import { createAttentionController } from './controller.js'

const config = {
  onComplete: true,
  onApproval: true,
  onQuestion: true,
  includeSubagents: false,
  completionDelayMs: 800,
  completionSound: 'Glass',
  attentionSound: 'Sosumi',
  commandTimeoutMs: 10000,
}

function fixture(overrides = {}) {
  const calls = []
  const timers = new Map()
  const killed = []
  let nextTimer = 1
  const controller = createAttentionController({ ...config, ...overrides }, {
    execute(command, args, options, callback) {
      const call = { command, args, options, callback }
      calls.push(call)
      return { kill: () => { killed.push(call) } }
    },
    schedule(callback, delay) {
      const id = nextTimer++
      timers.set(id, { callback, delay })
      return id
    },
    unschedule(id) { timers.delete(id) },
    logger: { warn() {} },
  })
  return {
    controller,
    calls,
    timers,
    killed,
    fire() {
      const [id, timer] = timers.entries().next().value
      timers.delete(id)
      timer.callback()
    },
  }
}

function agent(id = 'session-1', origin, status = 'running') {
  return {
    id,
    status,
    session: { id, header: { id, origin, cwd: '/Users/test/project' } },
  }
}

function endTurn(controller, session, turn = 1, kind = 'completed') {
  controller.onSessionEvent(session, {
    type: 'turn/end',
    data: { turn, reason: { kind } },
  })
}

test('notifies once after a completed main-session turn becomes idle', () => {
  const f = fixture()
  const current = agent()
  endTurn(f.controller, current.session)
  current.status = 'idle'
  f.controller.onAgentStatus({ agent: current, status: 'idle' })
  assert.equal(f.calls.length, 0)
  assert.equal([...f.timers.values()][0].delay, 800)
  f.fire()
  assert.equal(f.calls.length, 1)
  assert.match(f.calls[0].args[3], /project：任务已完成/)
  assert.equal(f.calls[0].args[4], 'Glass')
  current.status = 'running'
  f.controller.onAgentStatus({ agent: current, status: 'running' })
  current.status = 'idle'
  f.controller.onAgentStatus({ agent: current, status: 'idle' })
  assert.equal(f.timers.size, 0)
})

test('cancels a delayed completion alert when work resumes', () => {
  const f = fixture()
  const current = agent()
  endTurn(f.controller, current.session)
  current.status = 'idle'
  f.controller.onAgentStatus({ agent: current, status: 'idle' })
  current.status = 'running'
  f.controller.onAgentStatus({ agent: current, status: 'running' })
  assert.equal(f.timers.size, 0)
  assert.equal(f.calls.length, 0)
})

test('does not send completion alerts for aborted turns or subagents', () => {
  const f = fixture()
  const current = agent()
  endTurn(f.controller, current.session, 1, 'aborted')
  current.status = 'idle'
  f.controller.onAgentStatus({ agent: current, status: 'idle' })
  const child = agent('session-2', 'subagent')
  endTurn(f.controller, child.session)
  child.status = 'idle'
  f.controller.onAgentStatus({ agent: child, status: 'idle' })
  assert.equal(f.timers.size, 0)
  assert.equal(f.calls.length, 0)
})

test('delegates approvals and questions after notifying without changing their outcome', async () => {
  const f = fixture()
  const current = agent()
  const approval = await f.controller.onApproval({ agent: current, toolName: 'bash' }, async () => 'allowed-once')
  const answer = { questions: [] }
  const question = await f.controller.onQuestion({ agent: current }, async () => answer)
  assert.equal(approval, 'allowed-once')
  assert.equal(question, answer)
  assert.equal(f.calls.length, 2)
  assert.match(f.calls[0].args[3], /需要审批“bash”/)
  assert.match(f.calls[1].args[3], /有问题等待你回答/)
  assert.equal(f.calls[0].args[4], 'Sosumi')
})

test('uses a silent notification when the configured sound is empty', () => {
  const f = fixture({ completionSound: '' })
  const current = agent()
  endTurn(f.controller, current.session)
  current.status = 'idle'
  f.controller.onAgentStatus({ agent: current, status: 'idle' })
  f.fire()
  assert.equal(f.calls[0].args.length, 4)
  assert.doesNotMatch(f.calls[0].args[1], /sound name/)
})

test('dispose clears delayed work and terminates an in-flight notifier', () => {
  const f = fixture()
  const current = agent()
  endTurn(f.controller, current.session)
  current.status = 'idle'
  f.controller.onAgentStatus({ agent: current, status: 'idle' })
  f.fire()
  f.controller.dispose()
  assert.equal(f.timers.size, 0)
  assert.equal(f.killed.length, 1)
})
