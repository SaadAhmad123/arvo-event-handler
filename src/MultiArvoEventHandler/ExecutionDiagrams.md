# MultiArvoEventHandler.execute

Below are the execution flow diagrams of the execute function for the handler

## Execution flow diagram

```mermaid
graph TD
A[Start] --> B[Create OpenTelemetry Span]
B --> C{Has traceparent?}
C -->|Yes| D[Start Span with Inherited Context]
C -->|No| E[Start New Span]
D --> F[Set Span Attributes]
E --> F
F --> G{event.to === this.source?}
G -->|No| H[Throw Error]
G -->|Yes| I[Execute Handler Function]
I --> J{Handler Output?}
J -->|Yes| K[Process Output Events]
J -->|No| L[Return Empty Array]
K --> M[Create Result Events]
M --> N[Set Span Attributes for Output]
N --> O[Return Result Events]

I --> P{Error Occurred?}
P -->|Yes| Q[Set Error Status]
Q --> R[Create System Error Event]
R --> S[Set Span Attributes for Error]
S --> T[Return Error Event]

H --> Q
O --> U[End Span]
T --> U
L --> U
U --> V[End]

subgraph Error Handling
P
Q
R
S
T
H
end

subgraph Event Processing
I
J
K
M
N
O
end

subgraph Telemetry
B
D
E
F
N
S
U
end
```

## Execution sequence diagram

```mermaid
sequenceDiagram
participant Caller
participant MultiArvoEventHandler
participant OpenTelemetry
participant HandlerFunction
participant EventFactory

Caller->>MultiArvoEventHandler: execute(event)
MultiArvoEventHandler->>OpenTelemetry: Create or continue span

alt Event has traceparent
MultiArvoEventHandler->>OpenTelemetry: Extract context
OpenTelemetry-->>MultiArvoEventHandler: Inherited context
else No traceparent
MultiArvoEventHandler->>OpenTelemetry: Start new span
end

MultiArvoEventHandler->>OpenTelemetry: Set span attributes

alt event.to !== this.source
MultiArvoEventHandler->>EventFactory: Create system error event
EventFactory-->>MultiArvoEventHandler: Error event
MultiArvoEventHandler->>OpenTelemetry: Set error status
MultiArvoEventHandler->>OpenTelemetry: Set error attributes
MultiArvoEventHandler->>OpenTelemetry: End span
MultiArvoEventHandler-->>Caller: Return error event
else event.to === this.source
MultiArvoEventHandler->>HandlerFunction: Execute handler

alt Handler execution successful
HandlerFunction-->>MultiArvoEventHandler: Handler output
MultiArvoEventHandler->>EventFactory: Create output event(s)
EventFactory-->>MultiArvoEventHandler: Output event(s)
MultiArvoEventHandler->>OpenTelemetry: Set output attributes
MultiArvoEventHandler->>OpenTelemetry: End span
MultiArvoEventHandler-->>Caller: Return output event(s)
else Handler execution failed
HandlerFunction-->>MultiArvoEventHandler: Throw error
MultiArvoEventHandler->>OpenTelemetry: Set error status
MultiArvoEventHandler->>EventFactory: Create system error event
EventFactory-->>MultiArvoEventHandler: Error event
MultiArvoEventHandler->>OpenTelemetry: Set error attributes
MultiArvoEventHandler->>OpenTelemetry: End span
MultiArvoEventHandler-->>Caller: Return error event
end
end
```
