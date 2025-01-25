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
        InitializeSpan --> SetSpanStatus: Set SpanStatusCode.OK
        SetSpanStatus --> SetEventAttributes: Set OTEL Attributes
    }

    state ValidationPhase {
        SetEventAttributes --> ValidateEventType: Contract Type Check
        ValidateEventType --> ValidateContractUri: Success
        ValidateEventType --> ThrowConfigViolation: Mismatch with configured contract type
        
        ValidateContractUri --> ResolveVersion: Success
        ValidateContractUri --> ThrowContractViolation: URI Mismatch

        ResolveVersion --> LoadHandlerContract: Get Version
        LoadHandlerContract --> ValidatePayload: Success
        LoadHandlerContract --> ThrowConfigViolation: Version does not exist
        ValidatePayload --> ExecuteHandler: Valid
        ValidatePayload --> ThrowContractViolation: Invalid
    }

    state HandlerExecution {
        ExecuteHandler --> ProcessOutput: Success
        ExecuteHandler --> HandleError: Runtime Error
        
        ProcessOutput --> CreateEvents: Has Output
        ProcessOutput --> ReturnEmpty: No Output
        
        CreateEvents --> ValidateOutputEvents: Create via Factory
        ValidateOutputEvents --> SetOutputAttributes: Valid
        ValidateOutputEvents --> ThrowContractViolation: Invalid
    }

    state ErrorHandling {
        HandleError --> CheckViolationType: Catch Block
        CheckViolationType --> ThrowViolation: Is Violation
        CheckViolationType --> CreateSystemError: Runtime Error
        
        ThrowConfigViolation --> [*]
        ThrowContractViolation --> [*]
        ThrowViolation --> [*]
        
        CreateSystemError --> SetErrorSpan
        SetErrorSpan --> ReturnErrorEvent
    }

    SetOutputAttributes --> FinalizeSpan
    ReturnEmpty --> FinalizeSpan
    ReturnErrorEvent --> FinalizeSpan
    FinalizeSpan --> [*]

    note right of SpanManagement
        Manages OpenTelemetry context
        Sets initial status and attributes
    end note

    note right of ValidationPhase
        Validates event structure:
        - Event type matches contract
        - Contract URI matches
        - Schema version resolution
        - Payload validation
    end note

    note right of HandlerExecution
        Executes version-specific handler
        Processes and validates outputs
        Creates result events
    end note

    note right of ErrorHandling
        Handles three error types:
        - ConfigViolation (throws)
        - ContractViolation (throws)
        - Runtime errors (returns error event)
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
    Handler->>OTel: setSpanStatus(OK)
    Handler->>OTel: setAttributes(event.otelAttributes)

    %% Validation Phase
    Handler->>Contract: validate event.type === contract.type
    alt Type Mismatch
        Handler-->>Caller: throw ConfigViolation
    end

    Handler->>Contract: EventDataschemaUtil.parse(event)
    
    alt URI Mismatch
        Handler-->>Caller: throw ContractViolation
    end

    alt No Version Found
        Handler->>OTel: logToSpan(WARNING)
        Note over Handler,Contract: Use latest version
    end

    %% Version Resolution
    Handler->>Contract: version(parsedVersion ?? 'latest')
    alt Version Not Available
        Handler-->>Caller: throw ConfigViolation
    end

    %% Payload Validation
    Handler->>Contract: validate event.data
    alt Invalid Payload
        Handler-->>Caller: throw ContractViolation
    end

    %% Handler Execution
    Handler->>HandlerFn: handler[version](event, source, span)
    activate HandlerFn
    
    alt Handler Success with Output
        HandlerFn-->>Handler: return output
        Handler->>Factory: create result events
        Factory-->>Handler: return events
        Handler->>OTel: logToSpan(SUCCESS)
        Handler-->>Caller: return resultEvents
    else Handler Success No Output
        HandlerFn-->>Handler: return null
        Handler-->>Caller: return []
    else Handler Runtime Error
        HandlerFn-->>Handler: throw Error
        Handler->>Factory: systemError(event, error)
        Factory-->>Handler: return errorEvent
        Handler->>OTel: setSpanStatus(ERROR)
        Handler-->>Caller: return [errorEvent]
    end
    deactivate HandlerFn

    %% Error Handling for Violations
    opt Any Violation Error (ExecutionViolation)
        Handler->>OTel: setSpanStatus(ERROR)
        Handler-->>Caller: throw Violation
    end

    Handler->>OTel: span.end()
    deactivate OTel
    deactivate Handler
```