# Realtime

Frappe uses Socket.IO for WebSocket-based realtime events. A Node.js Socket.IO
server (`realtime/index.js`, launched by `bench start` / the `socketio` Procfile
entry) subscribes to a Redis `events` pub/sub channel; `frappe.publish_realtime`
publishes to that channel and the Node server relays to the matching Socket.IO room.

## Publishing events (server -> client)

```python
def publish_realtime(
    event: str | None = None,
    message: dict | None = None,
    room: str | None = None,
    user: str | None = None,
    doctype: str | None = None,
    docname: str | None = None,
    task_id: str | None = None,
    after_commit: bool = False,
): ...
```

Room resolution (`frappe/realtime.py::publish_realtime`) when `room` is not passed:
`task_id` > `user` > `doctype`+`docname` > site room (fallback). An explicit `room=`
is used as-is, **except** for two reserved event names that always derive their own
room regardless of what `room=`/`doctype=`/`docname=` was passed: `event="list_update"`
always targets the doctype room, and `event="docinfo_update"` always targets the doc
room.

```python
# Site-wide broadcast (all System User Desk sessions connected to this site)
# This is the fallback when no user/doctype/docname/room/task_id is specified
frappe.publish_realtime("expense_updated", {"name": "EXP-0001", "status": "Approved"})

# To a specific user (only that user's connections receive it)
frappe.publish_realtime("notification", {"message": "Approved"}, user="john@example.com")

# To a specific document room (only users who have that document open)
frappe.publish_realtime("comment_added", {"text": "Nice"},
    doctype="Expense", docname="EXP-0001")

# After commit only (event fires only if transaction succeeds); queued per-request
# and flushed via frappe.db.after_commit, deduped so identical (event, message, room)
# triples aren't emitted twice
frappe.publish_realtime("expense_created", data, after_commit=True)

# Progress events — wraps publish_realtime("progress", ...) with the room already
# resolved (task room if task_id, else doc room if doctype+docname, else user room)
frappe.publish_progress(percent=40, title="Importing", description="40 of 100")
```

## Room types

| Room | Key format | Who receives | When used |
|------|-----------|---------------|-----------|
| Site room | `"all"` | System User Desk sessions on the site | Default fallback |
| Website room | `"website"` | All connected sessions (every socket joins this) | Portal/guest broadcasts |
| User room | `f"user:{user}"` | Single user's connections | `user=` specified |
| Doc room | `f"doc:{doctype}/{docname}"` | Users viewing that document | `doctype=`+`docname=`, or `doc_subscribe` |
| Doctype room | `f"doctype:{doctype}"` | Users viewing that DocType list | `event="list_update"` |
| Task room | `f"task_progress:{task_id}"` | Caller tracking a background task | `task_id` present |

Every socket joins its user room and the website room on connect; it additionally
joins the site room (`"all"`) only if `socket.user_type == "System User"`
(`realtime/handlers.js`) — guests and portal (website) users never receive site-wide
broadcasts.

## Listening on client

### Desk (client scripts, form scripts)

```javascript
frappe.realtime.on("expense_updated", (data) => {
    console.log(data.name, data.status);
});

frappe.realtime.off("expense_updated");
```

### Generic client (external app, custom frontend)

Connect via Socket.IO using the site URL and cookie-based auth:

```javascript
import { io } from "socket.io-client";

const socket = io("http://site.localhost:9000", {
    withCredentials: true,
    reconnectionAttempts: 5,
});

// Join a room to receive events
socket.emit("doctype_subscribe", "Expense");           // doctype list updates
socket.emit("doc_subscribe", "Expense", "EXP-0001");   // specific document updates

// Listen for events
socket.on("expense_updated", (data) => {
    console.log(data);
});

// Cleanup
socket.emit("doc_unsubscribe", "Expense", "EXP-0001");
socket.disconnect();
```

Port 9000 is the default Socket.IO port in Frappe development (`bench start`).
Site-wide broadcasts reach only System User Desk sessions, never guests or portal
users (see room-join rule above).

## Sources

- `frappe/realtime.py` — `publish_realtime`, `publish_progress`, room helpers
- `realtime/index.js`, `realtime/handlers.js` — Node Socket.IO server, room joins
- `frappe/public/js/frappe/socketio_client.js` — `frappe.realtime` client
