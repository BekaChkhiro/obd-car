import { useEffect } from 'react';
import { connectionMachine } from '../ble/connection';
import {
  registerToolExecutor,
  sendToolResult,
  unregisterToolExecutor,
} from '../store/chat';

/**
 * Registers a BLE tool executor for the duration of the component's mount.
 *
 * When the backend dispatches a tool_call frame, this executor runs the
 * corresponding BLE operation via the current ConnectedAdapter and sends
 * the result back over the WebSocket so Claude can continue the turn.
 *
 * Call this hook once at the top of the screen that owns the chat session
 * (chat.tsx). The registration is a no-op when no BLE adapter is connected —
 * the tool call will time out on the backend side and Claude will surface the
 * error to the user.
 */
export function useToolExecutor(): void {
  useEffect(() => {
    registerToolExecutor(async (toolUseId, name, input) => {
      const adapter = connectionMachine.getAdapter();
      if (!adapter) {
        sendToolResult(toolUseId, 'No OBD-II adapter connected', true);
        return;
      }

      try {
        let result: unknown;

        switch (name) {
          case 'read_pid': {
            const pid = input.pid as string;
            const val = await adapter.pid.readPid(pid, { priority: 'high' });
            result = { pid: val.name, value: val.value, unit: val.unit };
            break;
          }

          case 'read_battery_voltage': {
            const val = await adapter.pid.readBatteryVoltage({ priority: 'high' });
            result = { value: val.value, unit: val.unit };
            break;
          }

          case 'read_dtcs': {
            const includePending = Boolean(input.include_pending);
            const dtcs = await adapter.dtc.readDtcs({
              includePending,
              priority: 'high',
            });
            result = {
              dtcs: dtcs.map((d) => ({
                code: d.code,
                description: d.description ?? null,
                isPending: d.isPending,
              })),
            };
            break;
          }

          case 'clear_dtcs': {
            const { verified, remainingDtcs } = await adapter.dtc.clearDtcs({
              priority: 'high',
            });
            result = {
              cleared: true,
              verified,
              remainingCount: remainingDtcs.length,
              remainingDtcs: remainingDtcs.map((d) => d.code),
            };
            break;
          }

          case 'read_freeze_frame':
            // Implemented in T5.6.
            sendToolResult(toolUseId, 'Freeze frame reader not yet available', true);
            return;

          case 'read_vin':
            // Implemented in T5.6.
            sendToolResult(toolUseId, 'VIN reader not yet available', true);
            return;

          default:
            sendToolResult(toolUseId, `Unknown tool: ${name}`, true);
            return;
        }

        sendToolResult(toolUseId, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendToolResult(toolUseId, message, true);
      }
    });

    return () => unregisterToolExecutor();
  }, []);
}
