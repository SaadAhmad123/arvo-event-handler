import { Span, SpanKind, SpanOptions } from '@opentelemetry/api';
import {
  ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  OpenInference,
  OpenInferenceSpanKind,
} from 'arvo-core';
import * as fs from 'fs';
import * as path from 'path';
import { ArvoEventHandlerTracer, extractContext } from '.';

interface PackageJson {
  name: string;
  version: string;
  [key: string]: any;
}

export function getPackageInfo(): { name: string; version: string } {
  try {
    // Read the package.json file
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');

    // Parse the JSON content
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    // Extract name and version
    const { name, version } = packageJson;

    return { name, version };
  } catch (error) {
    console.error('Error reading package.json:', error);
    return { name: 'Unknown', version: 'Unknown' };
  }
}

export const createSpanFromEvent = (
  spanName: string,
  event: ArvoEvent,
  spanKinds: {
    kind: SpanKind;
    openInference: OpenInferenceSpanKind;
    arvoExecution: ArvoExecutionSpanKind;
  },
): Span => {
  const spanOptions: SpanOptions = {
    kind: spanKinds.kind,
    attributes: {
      [OpenInference.ATTR_SPAN_KIND]: spanKinds.openInference,
      [ArvoExecution.ATTR_SPAN_KIND]: spanKinds.arvoExecution,
    },
  };

  let span: Span;
  if (event.traceparent) {
    const inheritedContext = extractContext(
      event.traceparent,
      event.tracestate,
    );
    span = ArvoEventHandlerTracer.startSpan(
      spanName,
      spanOptions,
      inheritedContext,
    );
  } else {
    span = ArvoEventHandlerTracer.startSpan(spanName, spanOptions);
  }

  return span;
};
