# ArvoEventHandler.execute 

Below are the execution flow diagrams of the execute function for the handler

## Execution flow diagram

```mermaid
graph TD
    A[Start] --> B[Create OpenTelemetry Span]
    B --> C{Has traceparent?}
    C -->|Yes| D[Start Span with Inherited Context]
    C -->|No| E[Start New Span]
    D --> F[Validate Input Event]
    E --> F
    F --> G{Validation Error?}
    G -->|Yes| H[Throw Error]
    G -->|No| I[Execute Handler Function]
    I --> J{Handler Output?}
    J -->|Yes| K[Process Output Events]
    J -->|No| L[Return Empty Array]
    K --> M[Create Result Events]
    M --> N[Set Telemetry Data]
    N --> O[Return Result Events]
    
    H --> P[Create System Error Event]
    P --> Q[Set Error Telemetry Data]
    Q --> R[Return Error Event]
    
    O --> S[End Span]
    R --> S
    L --> S
    S --> T[End]
    
    subgraph Error Handling
    H
    P
    Q
    R
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
    N
    Q
    S
    end
```

## Execution sequence diagram

```mermaid
sequenceDiagram
    participant Caller
    participant ArvoEventHandler
    participant OpenTelemetry
    participant ContractValidator
    participant HandlerFunction
    participant EventFactory

    Caller->>ArvoEventHandler: execute(event)
    ArvoEventHandler->>OpenTelemetry: Create or continue span
    
    alt Event has traceparent
        ArvoEventHandler->>OpenTelemetry: Extract context
        OpenTelemetry-->>ArvoEventHandler: Inherited context
    else No traceparent
        ArvoEventHandler->>OpenTelemetry: Start new span
    end

    ArvoEventHandler->>OpenTelemetry: Set span attributes

    ArvoEventHandler->>ContractValidator: Validate input event
    
    alt Invalid event
        ContractValidator-->>ArvoEventHandler: Validation error
        ArvoEventHandler->>OpenTelemetry: Set error status
        ArvoEventHandler->>EventFactory: Create system error event
        EventFactory-->>ArvoEventHandler: Error event
        ArvoEventHandler->>OpenTelemetry: Set error attributes
        ArvoEventHandler->>OpenTelemetry: End span
        ArvoEventHandler-->>Caller: Return error event
    else Valid event
        ContractValidator-->>ArvoEventHandler: Validation success
        ArvoEventHandler->>HandlerFunction: Execute handler
        
        alt Handler execution successful
            HandlerFunction-->>ArvoEventHandler: Handler output
            ArvoEventHandler->>EventFactory: Create output event(s)
            EventFactory-->>ArvoEventHandler: Output event(s)
            ArvoEventHandler->>OpenTelemetry: Set output attributes
            ArvoEventHandler->>OpenTelemetry: End span
            ArvoEventHandler-->>Caller: Return output event(s)
        else Handler execution failed
            HandlerFunction-->>ArvoEventHandler: Throw error
            ArvoEventHandler->>OpenTelemetry: Set error status
            ArvoEventHandler->>EventFactory: Create system error event
            EventFactory-->>ArvoEventHandler: Error event
            ArvoEventHandler->>OpenTelemetry: Set error attributes
            ArvoEventHandler->>OpenTelemetry: End span
            ArvoEventHandler-->>Caller: Return error event
        end
    end
```

