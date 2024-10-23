# ArvoEventHandler.execute

Below are the execution flow diagrams of the execute function for the handler

## Execution flow diagram

```mermaid
graph TD
    A[Start] --> B[Create Handler Execution Span]
    
    subgraph Span Creation
        B --> C{Check OpenTelemetry Config}
        C -->|inheritFrom='event'| D[Create Span from Event]
        C -->|inheritFrom=<else>| E[Create New Span from current execution environment]
        
        D --> F[Set OpenInference Attributes]
        E --> F
        F --> G[Set ArvoExecution Attributes]
        G --> H[Set Span Kind]
    end

    H --> I[Validate Input Event]
    I --> J{Validation Error?}
    J -->|Yes| K[Throw Error]
    J -->|No| L[Execute Handler Function]
    
    L --> M{Handler Output?}
    M -->|Yes| N[Process Output Events]
    M -->|No| O[Return Empty Array]
    
    N --> P[Create Result Events]
    P --> Q[Set Output Telemetry Data]
    Q --> R[Return Result Events]

    K --> S[Create System Error Event]
    S --> T[Set Error Status & Attributes]
    T --> U[Return Error Event]

    R --> V[End Span]
    U --> V
    O --> V
    V --> W[End]

    subgraph Error Handling
        K
        S
        T
        U
    end

    subgraph Event Processing
        L
        M
        N
        P
        Q
        R
    end

    subgraph Telemetry Attributes
        style F fill:#f9f,stroke:#333
        style G fill:#f9f,stroke:#333
        style H fill:#f9f,stroke:#333
        style Q fill:#f9f,stroke:#333
        style T fill:#f9f,stroke:#333
    end
```

## Execution sequence diagram

```mermaid
sequenceDiagram
    participant Caller
    participant Handler as ArvoEventHandler
    participant Span as SpanCreation
    participant OTel as OpenTelemetry
    participant Validator as ContractValidator
    participant Function as HandlerFunction
    participant Factory as EventFactory

    Caller->>Handler: execute(event)
    
    Handler->>Span: createHandlerExecutionSpan()
    
    alt opentelemetryConfig.inheritFrom === 'event'
        Span->>OTel: createSpanFromEvent()
        OTel-->>Span: Event-based span
    else default config
        Span->>OTel: startSpan()
        OTel-->>Span: New span
    end
    
    Span->>OTel: Set OpenInference attributes
    Span->>OTel: Set ArvoExecution attributes
    Span->>OTel: Set SpanKind
    Span-->>Handler: Configured span

    Handler->>Validator: Validate input event
    
    alt Invalid event
        Validator-->>Handler: Validation error
        Handler->>OTel: Set error status
        Handler->>Factory: Create system error event
        Factory-->>Handler: Error event
        Handler->>OTel: Set error attributes
        Handler->>OTel: End span
        Handler-->>Caller: Return error event
    else Valid event
        Validator-->>Handler: Validation success
        Handler->>Function: Execute handler

        alt Handler execution successful
            Function-->>Handler: Handler output
            Handler->>Factory: Create output events
            Factory-->>Handler: Output events
            Handler->>OTel: Set output attributes
            Handler->>OTel: End span
            Handler-->>Caller: Return output events
        else Handler execution failed
            Function-->>Handler: Throw error
            Handler->>OTel: Set error status
            Handler->>Factory: Create system error event
            Factory-->>Handler: Error event
            Handler->>OTel: Set error attributes
            Handler->>OTel: End span
            Handler-->>Caller: Return error event
        end
    end
```
