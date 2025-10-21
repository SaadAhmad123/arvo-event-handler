import type { ArvoContract, VersionedArvoContract } from 'arvo-core';
import { v4 as uuid4 } from 'uuid';
import { ConfigViolation } from '../errors';
import { ArvoOrchestrationHandlerMap, type ArvoOrchestrationHandlerType } from './types';

/**
 * Validates that all service contracts in a collection have unique URIs.
 *
 * Iterates through the provided contracts and checks if any URI appears more than once.
 * Multiple versions of the same contract (with the same URI) are not allowed.
 *
 * @param contracts - A record mapping contract keys to their respective ArvoContract objects
 * @returns An object with a boolean result indicating if all contracts are unique, and the error keys if not
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
