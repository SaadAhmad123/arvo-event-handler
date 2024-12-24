[![SonarCloud](https://sonarcloud.io/images/project_badges/sonarcloud-white.svg)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
# Arvo

## What is Arvo

Arvo is an opinionated approach to building event-driven systems. It's designed as a pattern and methodology rather than a rigid framework.

## Principal

The core principle of Arvo is to provide a solid foundation with enough flexibility for customization, allowing you to impose your own technical posture, including security measures, event brokerage, and telemetry. While Arvo offers a structured approach, it encourages developers to implement their own solutions if they believe they can improve upon or diverge from Arvo's principles.

If you're looking to focus on results without getting bogged down in the nitty-gritty of event creation, handling, system state management, and telemetry, while also avoiding vendor lock-in, Arvo provides an excellent starting point. I believe, it strikes a balance between opinionated design and customization, making it an ideal choice for developers who want a head start in building event-driven systems without sacrificing flexibility.

Key features of Arvo include:

- Lightweight and unopinionated core
- Extensible architecture
- Cloud-agnostic design
- Built-in primitives for event-driven patterns
- Easy integration with existing systems and tools

Whether you're building a small microservice or a large-scale distributed system, my hope with Arvo is to offers you some of the tools and patterns to help you succeed in the world of event-driven architecture.

## Arvo suite

Arvo is a collection of libraries which allows you to build the event driven system in the Arvo pattern. However, if you feel you don't have to use them or you can use them as you see fit.

| Scope          | NPM                                                               | Github                                             | Documentation                                                |
| -------------- | ----------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Orchestration  | https://www.npmjs.com/package/arvo-xstate?activeTab=readme        | https://github.com/SaadAhmad123/arvo-xstate        | https://saadahmad123.github.io/arvo-xstate/index.html        |
| Core           | https://www.npmjs.com/package/arvo-core?activeTab=readme          | https://github.com/SaadAhmad123/arvo-core          | https://saadahmad123.github.io/arvo-core/index.html          |
| Event Handling | https://www.npmjs.com/package/arvo-event-handler?activeTab=readme | https://github.com/SaadAhmad123/arvo-event-handler | https://saadahmad123.github.io/arvo-event-handler/index.html |

# Arvo - Event Handler

This package contains the event handler primitive required to enable an Arvo Event Driven System. These are light weight classes and types which take care of event listening, contract bound type inference, distributed open telemetry and much more.

## Documentation & Resources

| Source       | Link                                                              |
| ------------ | ----------------------------------------------------------------- |
| Package      | https://www.npmjs.com/package/arvo-event-handler?activeTab=readme |
| Github       | https://github.com/SaadAhmad123/arvo-event-handler                |
| Documenation | https://saadahmad123.github.io/arvo-event-handler/index.html      |

## Installation

You can install the core package via `npm` or `yarn`

```bash
npm install arvo-event-handler arvo-core
```

```bash
yarn add arvo-event-handler arvo-core
```

## Components

There 2 main types of event handlers in Arvo event driven system

- [ArvoEventHandler](src/ArvoEventHandler/README.md) is designed to facilitate the handling of events as per an `ArvoContract` (see [arvo-core](https://saadahmad123.github.io/arvo-core/documents/ArvoContract.html)). It provides a robust and flexible way to create, manage, and execute event handlers for Arvo-based event driven systems.
- [ArvoEventRouter](src/ArvoEventRouter/README.md) is designed to route ArvoEvents to appropriate ArvoEventHandlers. It provides a centralized mechanism for managing and executing multiple event handlers based on event types.
- [MultiArvoEventHandler](src/MultiArvoEventHandler/README.md) is a flexible and powerful event handling class designed to process multiple event types across different ArvoContracts. This handler offers greater versatility compared to the more specialized `ArvoEventHandler`, as it's not bound to a specific contract or event type.

## Getting Started

To start using Arvo Event Handlers in your project:

- Install the package as shown in the Installation section.
- Import the necessary components:

```javascript
import {
  createArvoEvent,
  createArvoContract,
  createArvoContractLibrary,
  createArvoEventFactory,
} from 'arvo-core';

import {
  createArvoEventHandler,
  createMultiArvoEventHandler,
  createArvoEventRouter,
} from 'arvo-event-handler';
```

- Begin defining your events, contracts, and handlers using the provided classes.

## License

This package is available under the MIT License. For more details, refer to the [LICENSE.md](LICENSE.md) file in the project repository.

## Change Logs

For a detailed list of changes and updates, please refer to the [document](CHANGELOG.md) file.

### SonarCloud Metrics

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=bugs)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=coverage)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=SaadAhmad123_arvo-event-handler&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=SaadAhmad123_arvo-event-handler)
