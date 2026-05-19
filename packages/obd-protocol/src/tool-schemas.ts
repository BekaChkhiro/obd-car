// Anthropic tool definitions for OBD-II diagnostics.
// Consumed by the FastAPI backend to populate the `tools` array sent to Claude.
// The JSON-serialisable form is emitted to schemas/obd-tools.json via `pnpm generate`.

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: readonly string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

export const OBD_TOOL_SCHEMAS: readonly ToolDefinition[] = [
  {
    name: 'read_pid',
    description:
      'Read a live OBD-II parameter from the vehicle ECU over BLE. ' +
      'Returns the current sensor value with its engineering unit. ' +
      'Supported PIDs: 010C (RPM), 010D (speed km/h), 0105 (coolant °C), 012F (fuel %). ' +
      'For battery voltage use read_battery_voltage instead.',
    input_schema: {
      type: 'object',
      properties: {
        pid: {
          type: 'string',
          description:
            'Four-character hex PID identifier (mode + PID, e.g. "010C" for engine RPM).',
          enum: ['010C', '010D', '0105', '012F'],
        },
      },
      required: ['pid'],
    },
  },
  {
    name: 'read_battery_voltage',
    description:
      'Read the control-module (battery) voltage from the vehicle ECU (OBD-II PID 0142). ' +
      'Returns the voltage in volts. Use this instead of read_pid when checking battery health.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_freeze_frame',
    description:
      'Read a freeze-frame PID (mode 02) snapshot captured at the moment a DTC was stored. ' +
      'Requires a DTC code to identify which freeze frame to read.',
    input_schema: {
      type: 'object',
      properties: {
        pid: {
          type: 'string',
          description: 'PID identifier (e.g. "020C" for freeze-frame RPM).',
        },
        dtc_code: {
          type: 'string',
          description:
            'DTC code associated with the freeze frame (e.g. "P0300").',
        },
      },
      required: ['pid', 'dtc_code'],
    },
  },
  {
    name: 'read_dtcs',
    description:
      'Retrieve stored Diagnostic Trouble Codes (DTCs) from the vehicle ECU. ' +
      'Returns an array of DTC codes with their categories.',
    input_schema: {
      type: 'object',
      properties: {
        include_pending: {
          type: 'boolean',
          description:
            'When true, also fetch pending DTCs (mode 07) in addition to stored DTCs (mode 03). Defaults to false.',
        },
      },
    },
  },
  {
    name: 'clear_dtcs',
    description:
      'Clear all stored and pending DTCs from the vehicle ECU (mode 04). ' +
      'IMPORTANT: This is a write operation and requires explicit user confirmation before the backend dispatches it. ' +
      'Never call this tool autonomously without the user asking to clear codes.',
    input_schema: {
      type: 'object',
      properties: {
        confirmed: {
          type: 'boolean',
          description:
            'Must be true. Signals that the user explicitly requested the DTC clear.',
        },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'read_vin',
    description:
      'Read the Vehicle Identification Number (VIN) from the ECU using mode 09 PID 02.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_permanent_dtcs',
    description:
      'Retrieve permanent Diagnostic Trouble Codes (DTCs) from the vehicle ECU (OBD-II mode 0x0A). ' +
      'Permanent DTCs cannot be cleared by the user — the ECU only removes them after it self-verifies ' +
      'the fault has been resolved through a complete drive cycle. ' +
      'Surface these alongside regular DTCs to give the user a complete picture of ECU health.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
] as const;
