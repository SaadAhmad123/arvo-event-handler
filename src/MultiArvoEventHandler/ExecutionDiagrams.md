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
F --> G[Execute Handler Function]
G --> H{Handler Output?}
H -->|Yes| I[Process Output Events]
H -->|No| J[Return Empty Array]
I --> K[Create Result Events]
K --> L[Set Span Attributes for Output]
L --> M[Return Result Events]
    
G --> N{Error Occurred?}
N -->|Yes| O[Set Error Status]
O --> P[Create System Error Event]
P --> Q[Set Span Attributes for Error]
Q --> R[Return Error Event]
    
M --> S[End Span]
R --> S
J --> S
S --> T[End]
    
subgraph Error Handling
N
O
P
Q
R
end
    
subgraph Event Processing
G
H
I
K
L
M
end
    
subgraph Telemetry
B
D
E
F
L
Q
S
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
```