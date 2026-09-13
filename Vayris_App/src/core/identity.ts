/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

export interface VayrisIdentity {
  name: string;
  creator: string;
  primaryUser: string;
  role: string;
}

export const VAYRIS_IDENTITY: VayrisIdentity = {
  name: "Vayris",
  creator: "Devansh Lamba",
  primaryUser: "Devansh Lamba",
  role: "Personal AI Assistant",
};

export function getCoreIdentityPrompt(): string {
  const now = new Date();
  return `You are ${VAYRIS_IDENTITY.name}, a ${VAYRIS_IDENTITY.role.toLowerCase()}.\nYour creator and primary user is ${VAYRIS_IDENTITY.primaryUser}.\nThe current system date and time is ${now.toLocaleString()} (${now.toISOString()}). Use this as the current reference time when scheduling tasks, alarms, or parsing temporal requests like "tomorrow" or "next week".`;
}
