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

## What This Package Provides

The `arvo-event-handler` package delivers a comprehensive suite of components that address every aspect of event-driven system development, from individual service implementation to complex workflow orchestration. Each component is designed to work independently while maintaining seamless integration with the broader Arvo ecosystem.

- **ArvoEventHandler** transforms ArvoContract definitions into actively enforced service implementations with automatic validation, multi-domain broadcasting, and comprehensive error handling. This component bridges the gap between service contracts and actual business logic, ensuring that services operate reliably within their defined boundaries while providing sophisticated event routing capabilities.

- **ArvoMachine** provides state machine-based workflow orchestration using a specialized variant of XState designed specifically for Arvo's event-driven architecture. It enforces synchronous execution patterns while enabling sophisticated state management with built-in contract validation, domain-aware event emission, and automatic resource locking optimization based on workflow complexity.

- **ArvoOrchestrator** coordinates complex workflows through state machine execution, lifecycle management, and distributed resource coordination. It manages the intricate relationship between machine definitions, memory persistence, and execution engines while maintaining comprehensive telemetry and supporting advanced patterns like parent-child workflow relationships.

- **ArvoResumable** offers a handler-based alternative to state machine orchestration, prioritizing explicit control and familiar imperative programming patterns. It provides equivalent workflow capabilities through direct handler functions rather than declarative state machine definitions, making it ideal for teams preferring procedural approaches to workflow management.

## Core Architecture Concepts

### Contract-First Development Philosophy

All components in `arvo-event-handler` embrace contract-first development through deep `ArvoContract` integration. Services define their interfaces using comprehensive schemas that provide compile-time type safety and runtime validation, ensuring reliable inter-service communication while enabling independent service evolution. This approach goes beyond simple data validation to encompass complete behavioral contracts including version management, event routing patterns, and error handling strategies.

The contract system establishes clear boundaries and expectations between services while providing automatic validation and type inference throughout the development lifecycle. This foundation eliminates common integration issues and enables confident refactoring and system evolution without breaking existing consumers.

### Multi-Domain Event Broadcasting Architecture

The package supports sophisticated event routing through multi-domain broadcasting capabilities that enable events to be distributed across multiple processing contexts simultaneously. This powerful feature allows for patterns like parallel processing pipelines, external system integration, human-in-the-loop workflows, and specialized monitoring systems.

Domain broadcasting operates through explicit domain specification that creates separate event instances for each target domain. The system automatically handles domain resolution through symbolic constants, deduplication to prevent redundant processing, and intelligent routing while maintaining event ordering and consistency guarantees essential for distributed system reliability.

### Comprehensive Observability Integration

Deep OpenTelemetry integration provides unprecedented visibility into system behavior through distributed tracing, structured logging, and performance metrics collection. Every component automatically creates detailed telemetry spans that capture execution context, timing information, business-relevant metadata, and correlation data across service boundaries.

The observability system extends beyond basic monitoring to include business process tracking, error correlation across distributed components, and performance optimization insights. This comprehensive approach enables proactive system management, rapid issue resolution, and data-driven optimization decisions while providing the visibility needed for effective capacity planning and system evolution.

### Sophisticated Error Handling Strategy

The package implements a multi-layered error handling approach that distinguishes between different types of failures and provides appropriate response mechanisms for each. The system separates infrastructure-level violations that require immediate operational attention from business logic errors that can be handled within workflow contexts.

System errors automatically convert into events that can be processed within workflow logic, enabling sophisticated error recovery patterns including compensation workflows, retry mechanisms, and alternative execution paths. Meanwhile, violations trigger immediate escalation for operational attention, ensuring that critical system issues receive appropriate priority while maintaining system stability.

### Distributed Resource Management

Sophisticated distributed resource locking ensures safe concurrent operations across workflow instances while optimizing performance for sequential workflows. The system automatically analyzes workflow structure to determine locking requirements, enabling performance optimization for simple workflows while providing safety guarantees for complex concurrent operations.

Lock management integrates seamlessly with the memory persistence layer to provide configurable locking strategies based on deployment requirements. This approach balances performance optimization with correctness guarantees while supporting deployment patterns ranging from single-instance scenarios to large-scale distributed configurations.

### Hierarchical Workflow Orchestration

Advanced parent-child orchestration capabilities enable complex business process modeling through hierarchical workflow relationships. Child workflows operate independently while maintaining proper connection to parent contexts, enabling sophisticated composition patterns and workflow reuse without compromising execution isolation.

The parent-child system maintains proper context propagation and domain-aware event routing while preserving execution boundaries. This design enables building complex business processes from simpler, reusable workflow components while maintaining clear responsibilities and enabling independent evolution of workflow components.

### Dynamic Version Management

Comprehensive version management capabilities enable service evolution without breaking existing consumers through sophisticated backward compatibility mechanisms. Version-specific implementations ensure reliable compatibility while providing clear migration paths for system evolution and enabling different service versions to coexist during transition periods.

The versioning system integrates deeply with the contract layer to provide compile-time safety for version-specific logic while enabling runtime routing based on event metadata. This approach supports gradual migration strategies and enables smooth system evolution while maintaining operational stability.

## Development and Testing Excellence

### Factory Pattern Architecture

The `EventHandlerFactory` pattern provides robust dependency injection capabilities that simplify testing while enabling clean architecture principles. Dependencies are explicitly declared and injected through type-safe factory interfaces, making unit testing straightforward and enabling mock implementations for comprehensive isolated testing.

Factory-based design also supports configuration-driven deployment where different environments can provide different implementations without changing business logic. This pattern promotes loose coupling between components and enables flexible deployment strategies while maintaining complete type safety throughout the dependency chain.

### Contract-Based Testing Strategy

Contract definitions enable comprehensive testing strategies that verify both implementation correctness and integration compatibility through automatic schema validation. The type safety system provides compile-time verification of event handling logic while runtime validation ensures data structure compliance.

Integration testing becomes more focused on event flow verification rather than exhaustive interaction testing, since contract enforcement automatically catches many potential integration issues at the contract level. This approach significantly reduces the testing surface area while providing higher confidence in system reliability and behavioral correctness.

### Local Development Architecture

The SimpleEventBroker enables complete event-driven architectures to run locally, allowing comprehensive testing of complex workflows without external dependencies. This capability accelerates development cycles and enables reliable continuous integration testing while maintaining production-like behavior patterns.

Local event architecture supports rapid prototyping, comprehensive integration testing, and effective debugging of complex event flows. Developers can test entire business processes locally while maintaining confidence that the same patterns will work reliably in distributed production environments.

## Performance and Scalability Design

### Horizontal Scaling Architecture

The functional architecture of all components provides natural support for horizontal scaling across distributed computing resources. Event handlers operate as pure functions with consistent behavior regardless of deployment location, while workflow orchestration maintains state through pluggable persistence interfaces that support various scaling strategies.

Scaling approaches can range from simple load balancing across multiple instances to sophisticated partitioning schemes based on workflow subjects, business domains, or processing requirements. The stateless design of event processing enables linear scaling characteristics while the state management abstraction supports various persistence and caching strategies.

### Performance Optimization Framework

Comprehensive performance optimization focuses on efficient resource utilization through careful monitoring and optimization of critical execution paths. Lock acquisition optimization, state persistence efficiency, and event processing throughput receive particular attention to ensure system responsiveness under varying load conditions.

The integrated telemetry system provides detailed insights into performance characteristics that enable data-driven optimization decisions. Resource cleanup mechanisms ensure timely release of system resources while maintaining responsiveness and preventing resource leaks in long-running deployments.

## Production Deployment Considerations

### Memory and State Management

The IMachineMemory interface supports various backend implementations optimized for different deployment scenarios. Production implementations must consider distributed system challenges including lock TTL mechanisms, retry strategies for transient failures, and consistency guarantees for state persistence operations.

State management strategies balance consistency requirements with performance considerations, implementing efficient storage and retrieval patterns while maintaining data integrity. The interface design supports everything from simple in-memory implementations for development to sophisticated distributed database systems for high-scale production deployments.

### Domain-Specific Deployment Patterns

Multi-domain event broadcasting enables sophisticated deployment architectures where different event domains can be routed to specialized processing infrastructure. This capability supports patterns like separating human-workflow events from automated processing, routing compliance events to specialized systems, or directing high-volume analytics events to dedicated processing clusters.

Domain-aware routing supports hybrid deployment strategies where core business logic runs in one environment while specialized processing occurs in optimized infrastructure. This flexibility enables organizations to optimize different aspects of their event-driven systems independently while maintaining unified business logic.

## Error Handling and Reliability

### Violation Classification System

The three violation types provide precise categorization of different failure modes with appropriate handling strategies for each. ContractViolation addresses schema compliance and service contract adherence issues, typically indicating version mismatches or data corruption that requires developer attention.

ConfigViolation handles system configuration and routing problems, often indicating deployment issues or service discovery failures that require operational intervention. ExecutionViolation provides a mechanism for application-specific exceptional conditions that require custom handling outside normal error flow patterns.

### System Resilience Patterns

The error handling architecture enables sophisticated resilience patterns including circuit breakers, compensation workflows, and graceful degradation strategies. System errors automatically convert into events that can trigger alternative execution paths, while violations ensure critical issues receive immediate attention.

This dual-layer approach enables building self-healing systems that can recover from transient failures while ensuring that serious system issues trigger appropriate operational responses. The error handling patterns support both automated recovery mechanisms and human intervention workflows as appropriate for different failure types.

## Documentation and Resources

| Component | Purpose | Documentation |
|-----------|---------|---------------|
| **ArvoEventHandler** | Contract-bound service implementation | [Implementation Guide](src/ArvoEventHandler/README.md) |
| **ArvoMachine** | State machine workflow orchestration | [State Machine Documentation](src/ArvoMachine/README.md) |
| **ArvoOrchestrator** | State machine execution engine | [Orchestration Guide](src/ArvoOrchestrator/README.md) |
| **ArvoResumable** | Handler-based workflow orchestration | [Handler-Based Workflows](src/ArvoResumable/README.md) |
| **IMachineMemory** | Distributed state persistence interface | [Memory Management](src/IMachineMemory/README.md) |
| **SimpleEventBroker** | Local event-driven architecture | [Event Broker Documentation](src/SimpleEventBroker/README.md) |

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