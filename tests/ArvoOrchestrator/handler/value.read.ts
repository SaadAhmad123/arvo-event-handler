import { type EventHandlerFactory, createArvoEventHandler } from '../../../src';
import { valueReadContract } from '../contracts';
import type { ValueStoreConfig } from './types';

export const valueReadHandler: EventHandlerFactory<ValueStoreConfig> = ({ valueStore }) =>
  createArvoEventHandler({
    contract: valueReadContract,
    executionunits: 0,
    handler: {
      '0.0.1': async ({ event }) => {
        const value: number | null = valueStore[event.data.key] ?? null;
        if (value === null) {
          throw new Error(`No value to find at key=${event.data.key}`);
        }
        return {
          type: 'evt.value.read.success',
          data: {
            key: event.data.key,
            value: value,
          },
        };
      },
    },
  });
