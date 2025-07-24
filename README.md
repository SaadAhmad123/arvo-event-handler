# Arvo Event Handler

The `arvo-event-handler` package serves as the comprehensive orchestration and event processing foundation for building sophisticated, reliable event-driven systems within the Arvo architecture. This package provides a complete toolkit of components that work seamlessly together to handle everything from simple event processing to complex distributed workflow orchestration, all while maintaining strict type safety, comprehensive observability, and robust error handling.

[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-white.svg)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)

## Installation

Install the package along with its core dependency:

```bash
npm install arvo-event-handler arvo-core
```

```bash
yarn add arvo-event-handler arvo-core
```

## The Event Handlers

The Arvo event handling architecture is based on three handler patterns.

### 1. Simple Event Handler

This kind of event handling is provided by [`ArvoEventHandler`](src/ArvoEventHandler/README.md). This approach transforms ArvoContract definitions into stateless, pure function handlers that process individual events in isolation. Each handler binds to a specific contract, validates incoming events against schema definitions, executes business logic, and returns response events. It supports multiple contract versions for backward compatibility and enables multi-domain event broadcasting for parallel processing pipelines. This pattern is ideal for microservices, API endpoints, and any scenario where you need reliable, contract-enforced event processing without complex state management or workflow coordination.

### 2. State-machine based workflow orchestration

This kind of event handling is provided by [`ArvoMachine`](src/ArvoMachine/README.md) which defines the state machine and [`ArvoOrchestrator`](src/ArvoOrchestrator/README.md) which executes it. This approach uses declarative state machine definitions to model complex business processes with multiple states, transitions, and conditional logic. ArvoMachine creates XState-compatible machines with Arvo-specific constraints and contract bindings, while ArvoOrchestrator provides the runtime environment for executing these machines with distributed state persistence, resource locking, and comprehensive lifecycle management. This pattern excels at complex workflows with parallel states, timing requirements, conditional branching, and scenarios where visual workflow modeling and deterministic state transitions are crucial for business process management.

### 3. Dynamic stateful event handling and orchestration

This kind of event handling is provided by [`ArvoResumable`](src/ArvoResumable/README.md). The event handling is a different approach to workflow processing and complements the state machine pattern by offering an imperative programming model where developers write handler functions that explicitly manage workflow state through context objects. Instead of defining states and transitions declaratively, you write code that examines incoming events, updates workflow context, and decides what actions to take next. This approach provides direct control over workflow logic, making it easier to debug and understand for teams familiar with traditional programming patterns, while still offering the same reliability, observability, and distributed coordination features as state machine orchestration.

## Core Infrastructure Components

Beyond the three main handler patterns, the package includes essential infrastructure components that enable robust distributed system operation.

### Memory - State Persistance

The [`IMachineMemory`](src/MachineMemory/README.md) interface defines how workflow state gets persisted and coordinated across distributed instances. It implements an optimistic locking strategy with "fail fast on acquire, be tolerant on release" semantics, ensuring data consistency while enabling system recovery from transient failures. 

This package includes `SimpleMachineMemory` for development/ prototyping scenarios and provides example for implementing cloud-based production-ready distributed storage solutions.

### Error Handling 

The Arvo event handling system uses a layered error handling approach that provides clear boundaries between different types of failures, enabling appropriate responses at each level.

**Business Logic Failures** are expected outcomes in your business processes and should be modeled as explicit events in your `ArvoContract` definitions. For example, when a user already exists during registration or a payment is declined, these represent normal business scenarios rather than system errors. By defining these as emittable events, downstream consumers can distinguish between business logic outcomes and actual system problems, enabling appropriate handling logic for each scenario.

**Transient System Errors** occur when underlying infrastructure or external services fail temporarily. Database connection timeouts, API unavailability, or network issues fall into this category. The system automatically converts uncaught exceptions into standardized system error events with the type pattern `sys.{contract.type}.error`. These events carry error details and can trigger retry mechanisms, circuit breakers, or alternative processing paths while maintaining the event-driven flow of your system.

**Violations** represent critical failures that require immediate attention and cannot be handled through normal event processing patterns. The system defines four distinct violation types to help you identify and respond to different categories of critical issues:

- `ContractViolation` occurs when event data fails contract validation, indicating schema mismatches between services. This typically signals version incompatibilities or data corruption that requires developer intervention to resolve.

- `ConfigViolation` happens when events are routed to handlers that cannot process them, revealing system topology or configuration problems that need infrastructure-level fixes.

- `ExecutionViolation` provides a mechanism for custom error handling when your business logic encounters scenarios that cannot be resolved through normal event patterns and require special intervention.

- `TransactionViolation` is raised specifically by `ArvoOrchestrator` and `ArvoResumable` when state persistence operations fail. The accompanying `TransactionViolationCause` provides detailed information about what went wrong, allowing you to implement appropriate recovery strategies for distributed transaction failures.


### Local Developement & Testing

The package provides `createSimpleEventBroker` utility which creates local event buses perfect for testing, development, and single-function workflow coordination. It enables comprehensive integration testing without external message brokers while supporting the same event patterns used in production distributed systems.


## Architecture Principles

The entire system follows consistent architectural principles that promote reliability and maintainability. All handlers implement the signature `ArvoEvent => Promise<{ events: ArvoEvent[] }>`, creating predictable event flow patterns throughout the system. Contract-first development ensures all service interactions are explicitly defined and validated, eliminating common integration issues while providing compile-time type safety.

Multi-domain event broadcasting allows single handlers to create events for different processing contexts simultaneously, supporting patterns like audit trails, analytics processing, and external system integration. The comprehensive observability integration provides operational visibility through OpenTelemetry spans, structured logging, and performance metrics collection.

The functional architecture enables natural horizontal scaling since handlers operate as pure functions with consistent behavior regardless of deployment location. State management through pluggable persistence interfaces supports various scaling strategies from single-instance deployments to sophisticated distributed configurations.

## Documentation and Resources

| Component | Documentation | When to Use |
|-----------|---------------|-------------|
| **ArvoEventHandler** | [Simple Event Processing](src/ArvoEventHandler/README.md) | Stateless services, API endpoints, microservices, simple request-response processing |
| **ArvoMachine** | [State Machine Workflows](src/ArvoMachine/README.md) | Complex business processes with multiple states, conditional branching, parallel execution, visual workflow modeling |
| **ArvoOrchestrator** | [Workflow Orchestration](src/ArvoOrchestrator/README.md) | Running state machines in production, distributed workflow coordination, comprehensive lifecycle management |
| **ArvoResumable** | [Handler-Based Workflows](src/ArvoResumable/README.md) | Dynamic workflows, imperative programming preference, rapid prototyping, teams familiar with traditional programming patterns |
| **MachineMemory** | [State Persistence Interface](src/MachineMemory/README.md) | Custom state storage requirements, distributed locking strategies, production persistence implementations |

## Package Information

| Resource | Link |
|----------|------|
| Package | [npm package](https://www.npmjs.com/package/arvo-event-handler) |
| Repository | [GitHub repository](https://github.com/SaadAhmad123/arvo-event-handler) |
| Documentation | [Complete documentation](https://saadahmad123.github.io/arvo-event-handler/index.html) |
| Core Package | [arvo-core documentation](https://saadahmad123.github.io/arvo-core/index.html) |

## License

This package is available under the MIT License. For more details, refer to the [LICENSE.md](LICENSE.md) file in the project repository.

### SonarCloud Metrics

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=bugs)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=coverage)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)