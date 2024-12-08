# ArvoEventHandler Technical Documentation

The ArvoEventHandler is a crucial component for handling Arvo events within the system. It manages the lifecycle of event processing, from initial receipt through validation, execution, and response generation, while maintaining comprehensive telemetry through OpenTelemetry integration.

## Core Responsibilities

The handler manages several key aspects of event processing:

1. Telemetry and tracing through OpenTelemetry
2. Event validation against contracts
3. Version resolution and compatibility
4. Error handling and system error event generation
5. Result event creation and routing

## Execution flow

```mermaid
stateDiagram-v2
    [*] --> StartExecution

    state SpanManagement {
        StartExecution --> InitializeSpan: Start Active Span
        InitializeSpan --> SetContext: Set from Event/Active Context
        SetContext --> SetInitialAttributes: Set OTEL Headers
    }

    state ValidationPhase {
        SetInitialAttributes --> ValidateEventType
        ValidateEventType --> ParseDataSchema: Valid Type
        ValidateEventType --> HandleError: Invalid Type

        ParseDataSchema --> ResolveVersion: Success
        ParseDataSchema --> LogWarningUseLatest: No Version Found
        LogWarningUseLatest --> ResolveVersion

        ResolveVersion --> LoadHandlerContract: Get Contract Version
        LoadHandlerContract --> ValidatePayload: Use Contract Schema
    }

    state HandlerExecution {
        ValidatePayload --> ExecuteHandler: Valid Payload
        ValidatePayload --> HandleError: Invalid Payload

        ExecuteHandler --> ProcessOutput: Has Output
        ExecuteHandler --> ReturnEmpty: No Output
        ExecuteHandler --> HandleError: Error in handler function

        ProcessOutput --> CreateEvents: Create Result Events
        CreateEvents --> SetOutputAttributes
    }

    state ErrorProcessing {
        HandleError --> CreateSystemError
        CreateSystemError --> SetErrorStatus
    }

    SetOutputAttributes --> FinalizeSpan
    ReturnEmpty --> FinalizeSpan
    SetErrorStatus --> FinalizeSpan
    FinalizeSpan --> [*]

    note right of SpanManagement
        Initializes OpenTelemetry span and context
        Sets initial attributes and headers
    end note

    note right of ValidationPhase
        Validates event type and schema
        Resolves contract version
        Validates payload against contract
    end note

    note right of HandlerExecution
        Executes handler function
        Processes outputs
        Creates result events
    end note

    note right of ErrorProcessing
        Handles all errors uniformly
        Creates system error events
        Sets error status on span
    end note
```

## Component diagram

The sequence diagram below illustrates the interactions between different components during event processing:

```mermaid
sequenceDiagram
    participant Caller
    participant Handler as ArvoEventHandler
    participant OTel as OpenTelemetry
    participant Contract as ArvoContract
    participant HandlerFn as HandlerFunction
    participant Factory as EventFactory

    Caller->>Handler: execute(event, opentelemetry?)

    %% Span Management
    Handler->>OTel: startActiveSpan("ArvoEventHandler")
    activate Handler
    activate OTel
    Handler->>OTel: setContext(event/active)
    Handler->>OTel: currentOpenTelemetryHeaders()
    Handler->>OTel: setSpanStatus(OK)
    Handler->>OTel: setAttributes(event.otelAttributes)
    deactivate OTel

    %% Validation Phase
    Handler->>Contract: validate(event.type === contract.type)
    alt Invalid Event Type
        Contract-->>Handler: throw Error
        Handler->>Factory: createArvoEventFactory(contract.latest)
        Handler->>Factory: systemError(event, error)
        Factory-->>Handler: return errorEvent
        Handler->>OTel: setSpanStatus(ERROR)
        Handler-->>Caller: return [errorEvent]
    end

    Handler->>Contract: EventDataschemaUtil.parse(event)
    alt No Version Found
        Handler->>OTel: logToSpan(WARNING)
        Note over Handler,Contract: Fallback to latest version
    end

    %% Contract Handling
    Handler->>Contract: resolved version from event or latest
    activate Contract
    Handler->>Contract: validate event data
    alt Invalid Payload
        Contract-->>Handler: validation error
        Handler->>Factory: createArvoEventFactory(contract.latest)
        Handler->>Factory: systemError(event, error)
        Factory-->>Handler: return errorEvent
        Handler->>OTel: setSpanStatus(ERROR)
        Handler-->>Caller: return [errorEvent]
    end
    deactivate Contract

    %% Handler Execution
    Handler->>HandlerFn: handler[version](event, source, span)
    activate HandlerFn
    alt Handler Success with Output
        HandlerFn-->>Handler: return output
        Handler->>Factory: createArvoEventFactory(contract)
        Handler->>Factory: create ArvoEvents to emit
        Factory-->>Handler: return result events
        Handler->>OTel: logToSpan(INFO)
        Handler-->>Caller: return resultEvents
    else Handler Success No Output
        HandlerFn-->>Handler: return null/undefined/void
        Handler-->>Caller: return []
    else Handler Error
        HandlerFn-->>Handler: throw Error
        Handler->>Factory: createArvoEventFactory(contract.latest)
        Handler->>Factory: systemError(event, error)
        Factory-->>Handler: return errorEvent
        Handler->>OTel: setSpanStatus(ERROR)
        Handler-->>Caller: return [errorEvent]
    end
    deactivate HandlerFn

    %% Cleanup
    Handler->>OTel: span.end()
    deactivate Handler
```

## Detailed Phase Descriptions

The execution process consists of four main phases:

### Span Management Phase

- Initializes OpenTelemetry context for distributed tracing
- Sets up span attributes for observability
- Ensures proper context propagation for distributed systems

### Validation Phase

- Verifies event type matches the contract
- Parses event data schema for version information
- Handles version resolution with fallback mechanisms
- Validates event payload against contract schema

### Handler Execution Phase

- Executes the appropriate version-specific handler
- Processes handler output
- Creates result events with proper routing
- Maintains telemetry throughout execution

### Error Processing Phase

- Provides uniform error handling across all phases
- Creates properly formatted system error events
- Ensures proper error reporting in telemetry

## Error Handling Strategy

The handler implements a comprehensive error handling strategy that:

- Catches and processes all errors uniformly
- Creates system error events with appropriate routing
- Maintains telemetry context through error scenarios
- Provides detailed error information for debugging

## Telemetry Integration

OpenTelemetry integration provides:

- Distributed tracing across the event processing lifecycle
- Detailed span attributes for debugging and monitoring
- Proper context propagation for distributed systems
- Performance metrics for each processing phase
