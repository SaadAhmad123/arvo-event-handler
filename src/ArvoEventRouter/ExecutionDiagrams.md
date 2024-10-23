# ArvoEventRouter.execute

Below are the execution flow diagrams of the execute function for the handler

## Execution flow diagram

```mermaid
graph TD
    A[Start] --> B[Create Handler Execution Span]
    
    subgraph Span Creation
        B --> C{Check OpenTelemetry Config}
        C -->|inheritFrom='event'| D[Create Span from Event]
        C -->|inheritFrom=<else>| E[Create New Span from Current Execution Environment]
        
        D --> F[Set OpenInference Attributes]
        E --> F
        F --> G[Set ArvoExecution Attributes]
        G --> H[Set Span Kind]
    end

    H --> I[Delete OTel Headers from Event]
    I --> J[Set Span Status OK]
    
    J --> K{Valid event.to?}
    K -->|No| L[Throw Error]
    K -->|Yes| M{Find Handler in Map}
    
    M -->|Not Found| N[Throw Error]
    M -->|Found| O[Execute Handler]
    
    O --> P{Handler Success?}
    P -->|Yes| Q[Process Results]
    P -->|No| R[Handle Error]
    
    Q --> S[Add Router Execution Units]
    S --> T[Add OTel Headers]
    T --> U[Create New Events]
    
    L --> V[Create System Error Event]
    N --> V
    R --> V
    V --> W[Set Error Status & Attributes]
    
    U --> X[End Span]
    W --> X
    X --> Y[End]

    subgraph Error Handling
        style V fill:#f88,stroke:#333
        style W fill:#f88,stroke:#333
        L
        N
        R
        V
        W
    end

    subgraph Event Processing
        style Q fill:#8f8,stroke:#333
        style S fill:#8f8,stroke:#333
        style T fill:#8f8,stroke:#333
        style U fill:#8f8,stroke:#333
        O
        P
        Q
        S
        T
        U
    end

    subgraph Telemetry Operations
        style F fill:#f9f,stroke:#333
        style G fill:#f9f,stroke:#333
        style H fill:#f9f,stroke:#333
        style I fill:#f9f,stroke:#333
        style J fill:#f9f,stroke:#333
        style X fill:#f9f,stroke:#333
        F
        G
        H
        I
        J
        X
    end
```

## Execution sequence diagram

```mermaid
sequenceDiagram
    participant Caller
    participant Router as ArvoEventRouter
    participant Span as SpanCreation
    participant OTel as OpenTelemetry
    participant Handler
    participant Factory as EventFactory

    Caller->>Router: execute(event)
    
    Router->>Span: createHandlerExecutionSpan()
    
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
    Span-->>Router: Configured span

    Router->>Router: Delete OTel headers from event
    Router->>OTel: Set status OK

    alt Invalid event.to
        Router->>Factory: Create system error event
        Factory-->>Router: Error event
        Router->>OTel: Set error attributes
        Router->>OTel: End span
        Router-->>Caller: Return error event
    else Valid event.to
        alt No handler found
            Router->>Factory: Create system error event
            Factory-->>Router: Error event
            Router->>OTel: Set error attributes
            Router->>OTel: End span
            Router-->>Caller: Return error event
        else Handler found
            Router->>Handler: execute(event, {inheritFrom: 'execution'})
            
            alt Handler execution successful
                Handler-->>Router: Results
                Router->>Router: Add execution units
                Router->>Router: Add OTel headers
                Router->>Factory: Create output events
                Factory-->>Router: Output events
                Router->>OTel: End span
                Router-->>Caller: Return output events
            else Handler execution failed
                Handler-->>Router: Throw error
                Router->>Factory: Create system error event
                Factory-->>Router: Error event
                Router->>OTel: Set error attributes
                Router->>OTel: End span
                Router-->>Caller: Return error event
            end
        end
    end
```
