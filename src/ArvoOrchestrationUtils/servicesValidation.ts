import type { ArvoContract, VersionedArvoContract } from 'arvo-core';
import { v4 as uuid4 } from 'uuid';
import { ConfigViolation } from '../errors';
import { ArvoOrchestrationHandlerMap, type ArvoOrchestrationHandlerType } from './types';

/**
 * Validates that all service contracts have unique URIs.
 *
 * Ensures no duplicate contract URIs exist in the service collection.
 * Multiple versions of the same contract (same URI) are not permitted as
 * they create ambiguity in event routing and contract resolution.
 */
export const areServiceContractsUnique = (
  contracts: Record<string, ArvoContract | VersionedArvoContract<any, any>>,
):
  | {
      result: false;
      keys: [string, string];
      contractUri: string;
    }
  | {
      result: true;
    } => {
  const uriToKeyMap: Record<string, string> = {};
  for (const [key, contract] of Object.entries(contracts)) {
    if (uriToKeyMap[contract.uri]) {
      return {
        result: false,
        keys: [key, uriToKeyMap[contract.uri]],
        contractUri: contract.uri,
      };
    }
    uriToKeyMap[contract.uri] = key;
  }
  return {
    result: true,
  };
};

/**
 * Validates service contracts for orchestration handlers.
 *
 * Performs two critical validations:
 * 1. Ensures all service contracts have unique URIs (no duplicate contracts)
 * 2. Prevents circular dependencies (self contract not registered as service)
 *
 * These validations prevent configuration errors that would cause runtime
 * failures or infinite execution loops in orchestration workflows.
 */
export const servicesValidation = (
  contracts: {
    self: ArvoContract | VersionedArvoContract<any, any>;
    services: Record<string, VersionedArvoContract<any, any>>;
  },
  _handlerType: ArvoOrchestrationHandlerType,
) => {
  const __areServiceContractsUnique = areServiceContractsUnique(contracts.services);
  if (!__areServiceContractsUnique.result) {
    throw new ConfigViolation(
      `In ${ArvoOrchestrationHandlerMap[_handlerType]}, the service contracts must have unique URIs. Multiple versions of the same contract are not allow. The contracts '${__areServiceContractsUnique.keys[0]}' and '${__areServiceContractsUnique.keys[1]}' have the same URI '${__areServiceContractsUnique.contractUri}'`,
    );
  }

  const __checkIfSelfIsAService = areServiceContractsUnique({
    ...contracts.services,
    [uuid4()]: contracts.self,
  });
  if (!__checkIfSelfIsAService.result) {
    throw new ConfigViolation(
      `In ${ArvoOrchestrationHandlerMap[_handlerType]}, Circular dependency detected: Machine with URI '${contracts.self.uri}' is registered as service '${__checkIfSelfIsAService.keys[1]}'. Self-referential services create execution loops and are prohibited.`,
    );
  }
};
