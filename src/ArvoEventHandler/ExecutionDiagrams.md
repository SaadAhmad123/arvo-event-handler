# ArvoEventHandler.execute

Below are the execution flow diagrams of the execute function for the handler

## Execution flow diagram

```mermaid
stateDiagram-v2
    [*] --> StartSpan

    state SpanContext {
        StartSpan --> SetSpanContext
        SetSpanContext --> GetOtelHeaders
        GetOtelHeaders --> SetStatusOK
    }

    SetStatusOK --> ValidateEventType

    ValidateEventType --> ParseDataSchema: Valid Type
    ValidateEventType --> HandleError: Invalid Type

    state SchemaHandling {
        ParseDataSchema --> GetVersion: Valid
        ParseDataSchema --> LogWarning: No Version
        LogWarning --> GetVersion: Use Latest Version
    }

    state ContractHandling {
        GetVersion --> SetAttributes
        SetAttributes --> ValidateInputEvent
    }

    ValidateInputEvent --> ExecuteHandler: Valid
    ValidateInputEvent` --> HandleError: Invalid

    state HandlerExecution {
        ExecuteHandler --> ProcessOutput: Has Output
        ExecuteHandler --> ReturnEmpty: No Output
        ProcessOutput --> CreateResultEvents
    }

    state ErrorHandling {
        HandleError --> CreateSystemError
        CreateSystemError --> SetErrorStatus
    }

    CreateResultEvents --> EndSpan
    SetErrorStatus --> EndSpan
    ReturnEmpty --> EndSpan

    EndSpan --> [*]

    note right of SpanContext
        Sets context and initial
        telemetry configuration
    end note

    note right of HandlerExecution
        Executes handler function
        Creates and processes events
    end note

    note right of ErrorHandling
        Handles validation and
        execution errors
    end note
```

## Execution sequence diagram

```mermaid
sequenceDiagram
    participant Caller
    participant Handler as ArvoEventHandler
    participant OTel as OpenTelemetry
    participant Contract as ContractHandler
    participant HandlerFn as HandlerFunction
    participant Factory as EventFactory

    Caller->>Handler: execute(event, opentelemetry?)
    Handler->>OTel: createOtelSpan()
    activate Handler

    Handler->>OTel: setSpan(context)
    Handler->>OTel: currentOpenTelemetryHeaders()
    Handler->>OTel: setStatus(OK)

    Handler->>Contract: validate event.type
    alt Invalid Type
        Contract-->>Handler: throw Error
    end

    Handler->>Contract: parseEventDataSchema(event)
    alt No Version
        Handler->>OTel: logToSpan(WARNING)
    end

    Handler->>Contract: version(parsedVersion ?? 'latest')
    Handler->>Factory: createArvoEventFactory()

    Handler->>OTel: setAttribute(otelAttributes)
    Handler->>Contract: accepts.schema.safeParse()

    alt Invalid Schema
        Contract-->>Handler: throw Error
    else Valid Schema
        Handler->>HandlerFn: execute(event, source)
        alt Has Output
            HandlerFn-->>Handler: return output
            Handler->>Factory: eventHandlerOutputEventCreator()
            Factory-->>Handler: return events
        else No Output
            HandlerFn-->>Handler: return (void)
            Handler-->>Caller: return []
        end
    end

    alt Error Caught
        Handler->>Factory: systemError()
        Factory-->>Handler: error event
        Handler->>OTel: setStatus(ERROR)
        Handler-->>Caller: return [errorEvent]
    end

    deactivate Handler
    Handler->>OTel: span.end()
```
