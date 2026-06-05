# Elegoo CC2 LAN Protocol

Protocol reference reverse-engineered from the Elegoo Slicer v1.5.0.7 web UI (`elegoolink/web/lan_service_web/index.html`).

## Transport

All communication uses **MQTT over TCP** on port **1883**.

### Credentials

| Field    | Value              |
|----------|--------------------|
| Username | `elegoo`           |
| Password | printer access code (shown in printer settings) |

### Client ID format

Client IDs follow this pattern, matching the slicer's own `I7e()` generator:

```
"0" + "cli" + last5hex(Date.now()) + 3hex(Math.random())  →  slice(0, 10)
```

Example output: `0cli29ccdd`, `0cli315bfd`.

The format is always 10 characters: `0cli` prefix + 6 hex digits.

> **Why this matters:** The printer firmware uses the MQTT client ID embedded in the topic path to route responses. Only a client that has completed the registration handshake (see below) will receive replies to its requests.

---

## Topic structure

| Purpose                  | Topic pattern                                       | Publisher  |
|--------------------------|-----------------------------------------------------|------------|
| Registration request     | `elegoo/{sn}/api_register`                          | client     |
| Registration response    | `elegoo/{sn}/{clientId}/register_response`          | printer    |
| API request              | `elegoo/{sn}/{clientId}/api_request`                | client     |
| API response             | `elegoo/{sn}/{clientId}/api_response`               | printer    |
| Status push (unsolicited)| `elegoo/{sn}/api_status`                            | printer    |
| Heartbeat                | `elegoo/{sn}/{clientId}/api_heartbeat`              | client     |

`{sn}` is the printer serial number (e.g. `ABCD1234XY5678Z`).  
`{clientId}` is the 10-character client ID generated above.

---

## Connection flow

```
Client                                    Printer MQTT Broker
  │                                              │
  │── MQTT CONNECT (clientId, user, pass) ──────>│
  │<─ CONNACK ──────────────────────────────────│
  │                                              │
  │── SUBSCRIBE elegoo/{sn}/api_status ─────────>│
  │── SUBSCRIBE elegoo/{sn}/{id}/api_response ──>│
  │── SUBSCRIBE elegoo/{sn}/{id}/register_response>│
  │<─ SUBACK ───────────────────────────────────│
  │                                              │
  │── PUBLISH elegoo/{sn}/api_register ─────────>│  { request_id: clientId, client_id: clientId }
  │<─ PUBLISH elegoo/{sn}/{id}/register_response─│  { client_id: clientId, error: "ok" }
  │                                              │
  │  ← registered, ready to send requests →     │
  │                                              │
  │── PUBLISH elegoo/{sn}/{id}/api_request ─────>│  { id: 1, method: 1001, params: {} }
  │<─ PUBLISH elegoo/{sn}/{id}/api_response ────│  { id: 1, method: 1001, result: { ... } }
  │                                              │
  │  (printer pushes status independently)      │
  │<─ PUBLISH elegoo/{sn}/api_status ───────────│  { id: N, method: 6000, result: { ... } }
```

> **Important:** The registration handshake is required. Without it the printer ignores all requests from that client ID, regardless of topic structure or credentials. Multiple clients can register concurrently — registration does not evict existing sessions.

---

## Message formats

### Registration request

Published to `elegoo/{sn}/api_register`:

```json
{
  "request_id": "0cli29ccdd",
  "client_id":  "0cli29ccdd"
}
```

Both fields carry the same client ID value.

### Registration response

Received on `elegoo/{sn}/{clientId}/register_response`:

```json
{ "client_id": "0cli29ccdd", "error": "ok" }
```

`error: "ok"` means success. Any other value indicates failure.

### API request

Published to `elegoo/{sn}/{clientId}/api_request`:

```json
{ "id": 1, "method": 1001, "params": {} }
```

`id` is a monotonically increasing integer used to match responses. `method` is one of the method codes below.

### API response

Received on `elegoo/{sn}/{clientId}/api_response`:

```json
{ "id": 1, "method": 1001, "result": { ... } }
```

The `id` field echoes the request. Check `result.error_code === 0` for success.

### Status push (unsolicited)

Received on `elegoo/{sn}/api_status`. The printer emits these continuously:

```json
{ "id": 5700, "method": 6000, "result": { "extruder": { "temperature": 27 }, ... } }
```

Pushes are **incremental** — only changed fields are included. Build a full state by merging successive pushes.

### Heartbeat

Published by the client to `elegoo/{sn}/{clientId}/api_heartbeat` every ~30 s to keep the session alive:

```json
{ "id": 0 }
```

---

## Method codes

### Request → Response

| Code | Name                  | Description                          |
|------|-----------------------|--------------------------------------|
| 1001 | `GET_ATTRIBUTES`      | Printer model, firmware, hostname    |
| 1002 | `GET_STATUS`          | Full printer state snapshot          |
| 1020 | `START_PRINT`         | Start a print job                    |
| 1021 | `PAUSE_PRINT`         | Pause current print                  |
| 1022 | `STOP_PRINT`          | Stop/cancel current print            |
| 1023 | `RESUME_PRINT`        | Resume paused print                  |
| 1026 | `HOME_AXES`           | Home one or more axes                |
| 1027 | `MOVE_AXES`           | Jog axes by a distance               |
| 1028 | `SET_TEMPERATURE`     | Set extruder / bed targets           |
| 1030 | `SET_FAN_SPEED`       | Set fan speeds                       |
| 1031 | `SET_PRINT_SPEED`     | Set speed mode (0–3)                 |
| 1036 | `GET_PRINT_TASK_LIST` | Paginated job history                |
| 1038 | `DELETE_PRINT_TASKS`  | Delete jobs by task ID               |
| 1043 | `UPDATE_NAME`         | Change printer hostname              |
| 1044 | `GET_FILE_LIST`       | Paginated file listing               |
| 1046 | `GET_FILE_DETAIL`     | Metadata for a single file           |
| 1057 | `DOWNLOAD_FILE`       | Trigger printer to pull a file by URL|
| 1058 | `CANCEL_DOWNLOAD`     | Cancel an in-progress download       |
| 2004 | `SET_AUTO_REFILL`     | Enable/disable auto filament refill  |
| 2005 | `GET_CANVAS_STATUS`   | Multi-filament canvas/tray state     |
| 7000 | `DISCOVERY`           | LAN discovery probe                  |

### Printer → Client (push / unsolicited)

| Code | Name              | Description                                 |
|------|-------------------|---------------------------------------------|
| 6000 | `ON_STATUS`       | Incremental status update (continuous push) |
| 6008 | `ON_ATTRIBUTES`   | Attributes update (pushed after changes)    |

---

## Example: GET_ATTRIBUTES (1001)

**Request:**
```json
{ "id": 1, "method": 1001, "params": {} }
```

**Response:**
```json
{
  "id": 1,
  "method": 1001,
  "result": {
    "error_code": 0,
    "hardware_version": "",
    "hostname": "Elegoo Centauri Carbon 2",
    "ip": "192.168.1.100",
    "machine_model": "Centauri Carbon 2",
    "protocol_version": "1.0.0",
    "sn": "ABCD1234XY5678Z",
    "software_version": {
      "mcu_version": "00.00.00.00",
      "ota_version": "02.00.02.00",
      "soc_version": ""
    }
  }
}
```

## Example: GET_STATUS (1002)

**Request:**
```json
{ "id": 2, "method": 1002, "params": {} }
```

**Response** (abbreviated):
```json
{
  "id": 2,
  "method": 1002,
  "result": {
    "error_code": 0,
    "extruder": { "temperature": 27, "target": 0, "filament_detected": 0 },
    "heater_bed": { "temperature": 24, "target": 0 },
    "fans": {
      "fan": { "speed": 0.0 },
      "box_fan": { "speed": 0.0 },
      "aux_fan": { "speed": 0.0 }
    },
    "machine_status": { "status": 1, "progress": 0, "sub_status": 0 },
    "print_status": { "enable": false, "filename": "", "current_layer": 0 },
    "led": { "status": 0 },
    "external_device": { "camera": true, "u_disk": true }
  }
}
```

---

## Notes

- All MQTT publishes use **QoS 1**.
- The printer sends `api_status` pushes roughly every second with only the fields that changed since the last push.
- The `GET_CANVAS_STATUS` (2005) result nests canvas/tray data under `result.canvas_info` (not `result.canvas_status` as the field is named in some CC2 firmware versions — validate against actual hardware).
- The Elegoo Slicer persists the client ID in `sessionStorage` so it survives page reloads without re-registering. In a Node.js context a fresh client ID per connection is fine — re-registration always succeeds.
