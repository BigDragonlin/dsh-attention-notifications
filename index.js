import Schema from '@deepseek-ai/schemastery'
import { createAttentionController } from './controller.js'

export const name = 'macos-attention-notifications'

export const Config = Schema.object({
  onComplete: Schema.boolean().default(true),
  onApproval: Schema.boolean().default(true),
  onQuestion: Schema.boolean().default(true),
  includeSubagents: Schema.boolean().default(false),
  completionDelayMs: Schema.number().min(0).max(60000).default(800),
  completionSound: Schema.string().default('Glass'),
  attentionSound: Schema.string().default('Sosumi'),
  commandTimeoutMs: Schema.number().min(1000).max(60000).default(10000),
})

/** Register task completion and pending-interaction alerts. */
export function apply(ctx, config) {
  if (process.platform !== 'darwin') {
    throw new Error('macos-attention-notifications requires macOS and /usr/bin/osascript')
  }
  const controller = createAttentionController(config, { logger: ctx.logger })
  ctx.on('session/event', controller.onSessionEvent)
  ctx.on('agent/status', controller.onAgentStatus)
  ctx.on('agent/disposed', controller.onAgentDisposed)
  ctx.on('approval/request', controller.onApproval, { prepend: true })
  ctx.on('user-questions/request', controller.onQuestion, { prepend: true })
  ctx.effect(() => controller.dispose, 'attention-notifications: timers and notification processes')
}
