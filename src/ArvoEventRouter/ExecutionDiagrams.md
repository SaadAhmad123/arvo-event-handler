# ArvoEventRouter.execute

Below are the execution flow diagrams of the execute function for the handler

## Execution flow diagram

```mermaid
graph TD
    A[Start] --> B[Initialize OpenTelemetry Span]
    B --> C{Has traceparent?}
    C -->|Yes| D[Start Span with Inherited Context]
    C -->|No| E[Start New Span]
    D --> F{Validate Event Destination}
    E --> F
    F --> G{Valid Destination? \n event.to === this.source}
    G -->|No| H[Throw Error]
    G -->|Yes| I[Find Handler for Event Type]
    I --> J{Handler Found?}
    J -->|No| K[Throw Error]
    J -->|Yes| L[Execute Handler]
    L --> M[Process Handler Results]
    M --> N[Create New Events]
    N --> O[Set OpenTelemetry Headers]
    O --> P[Return Result Events]

    H --> Q[Create Error Event]
    K --> Q
    Q --> R[Set Error Telemetry Data]
    R --> S[Return Error Event]

    P --> T[End Span]
    S --> T
    T --> U[End]

    subgraph Error Handling
    H
    K
    Q
    R
    S
    end

    subgraph Event Processing
    L
    M
    N
    O
    P
    end

    subgraph Telemetry
    B
    D
    E
    O
    R
    T
    end
```

## Execution sequence diagram

```mermaid
sequenceDiagram
    participant Caller
    participant ArvoEventRouter
    participant OpenTelemetry
    participant Handler
    participant EventFactory

    Caller->>ArvoEventRouter: execute(event)

    ArvoEventRouter->>OpenTelemetry: Create or continue span

    alt Event has traceparent
        ArvoEventRouter->>OpenTelemetry: Extract context
        OpenTelemetry-->>ArvoEventRouter: Inherited context
    else No traceparent
        ArvoEventRouter->>OpenTelemetry: Start new span
    end

    ArvoEventRouter->>OpenTelemetry: Set span attributes

    alt Invalid event.to
        ArvoEventRouter->>EventFactory: Create error event
        EventFactory-->>ArvoEventRouter: Error event
        ArvoEventRouter->>OpenTelemetry: Set error status and attributes
        ArvoEventRouter->>OpenTelemetry: End span
        ArvoEventRouter-->>Caller: Return error event
    else Valid event.to
        alt No handler found for event type
            ArvoEventRouter->>EventFactory: Create error event
            EventFactory-->>ArvoEventRouter: Error event
            ArvoEventRouter->>OpenTelemetry: Set error status and attributes
            ArvoEventRouter->>OpenTelemetry: End span
            ArvoEventRouter-->>Caller: Return error event
        else Handler found
            ArvoEventRouter->>Handler: execute(event)

            alt Handler execution successful
                Handler-->>ArvoEventRouter: Results
                ArvoEventRouter->>EventFactory: Create output event(s)
                EventFactory-->>ArvoEventRouter: Output event(s)
                ArvoEventRouter->>OpenTelemetry: Set output attributes
                ArvoEventRouter->>OpenTelemetry: End span
                ArvoEventRouter-->>Caller: Return output event(s)
            else Handler execution failed
                Handler-->>ArvoEventRouter: Throw error
                ArvoEventRouter->>EventFactory: Create error event
                EventFactory-->>ArvoEventRouter: Error event
                ArvoEventRouter->>OpenTelemetry: Set error status and attributes
                ArvoEventRouter->>OpenTelemetry: End span
                ArvoEventRouter-->>Caller: Return error event
            end
        end
    end
```
