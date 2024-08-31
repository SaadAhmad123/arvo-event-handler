import { createArvoContract, ArvoContractRecord, createContractualArvoEvent } from "arvo-core";
import { IArvoEventHandler } from "./types";
import {z} from 'zod'

export default class ArvoEventHandler<
  T extends string,
  TAccepts extends ArvoContractRecord,
  TEmits extends ArvoContractRecord,
> {
  constructor(param: IArvoEventHandler<T, TAccepts, TEmits>) {

  }
}

const contract = createArvoContract({
  uri: 'test-uri',
  accepts: {
    type: 'test.input.0',
    schema: z.object({ input: z.string() }),
  },
  emits: [
    {
      type: 'test.output.0',
      schema: z.object({
        output: z.number(),
      }),
    },
    {
      type: 'test.output.1',
      schema: z.object({
        message: z.string(),
      }),
    },
  ],
});

const x = new ArvoEventHandler({
  contract,
  executionunits: 0,
  handler: ({event, contract}) => {
    return {
      event: createContractualArvoEvent(contract).emits({
        type: 'test.output.0',
        data: {
          output: 43
        },
        source: 'test',
        subject: 'test',
        to: 'cmd.test.saad'
      })
    }
  }
})