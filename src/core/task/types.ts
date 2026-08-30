/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  PLANNING = 'PLANNING',
  RUNNING = 'RUNNING',
  WAITING_FOR_PERMISSION = 'WAITING_FOR_PERMISSION',
  VERIFYING = 'VERIFYING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface TaskStep {
  id: string;
  purpose: string;
  action?: string; // Tool name
  arguments?: Record<string, any>;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  result?: any;
  error?: string;
  retries: number;
}

export interface TaskState {
  taskId: string;
  originalGoal: string | import('../../providers/types').MessageContentPart[];
  reasoningMode?: import('../../providers/types').ReasoningMode;
  status: TaskStatus;
  steps: TaskStep[];
  currentStepId?: string;
  completionCriteria?: string[];
  timestamps: {
    created: number;
    updated: number;
    completed?: number;
  };
  metadata: Record<string, any>;
  cancellationRequested: boolean;
  abortController: AbortController;
}

export enum TaskEventType {
  TASK_STARTED = 'TASK_STARTED',
  PLAN_CREATED = 'PLAN_CREATED',
  STEP_STARTED = 'STEP_STARTED',
  TOOL_CALLED = 'TOOL_CALLED',
  TOOL_RESULT = 'TOOL_RESULT',
  PERMISSION_REQUESTED = 'PERMISSION_REQUESTED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  STEP_FAILED = 'STEP_FAILED',
  RETRYING = 'RETRYING',
  VERIFICATION_STARTED = 'VERIFICATION_STARTED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  TASK_CANCELLED = 'TASK_CANCELLED',
  MESSAGE_DELTA = 'MESSAGE_DELTA'
}

export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  timestamp: number;
  data?: any;
}
