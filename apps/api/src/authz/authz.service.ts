import { Injectable, OnModuleInit } from '@nestjs/common';
import { Enforcer, newEnforcer, newModelFromString, StringAdapter } from 'casbin';
import { RBAC_MODEL, RBAC_POLICY } from './authz.model';

/**
 * Authorization policy engine (casbin) for the Role Permission Matrix. Decides
 * whether a staff role may approve a dangerous action, with role inheritance.
 * Enforced by PermissionGuard once staff auth carries a role in the JWT.
 */
@Injectable()
export class AuthzService implements OnModuleInit {
  private enforcer!: Enforcer;

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  /** Explicit init so tests can build the enforcer without the Nest lifecycle. */
  async init(): Promise<void> {
    this.enforcer = await newEnforcer(
      newModelFromString(RBAC_MODEL),
      new StringAdapter(RBAC_POLICY),
    );
  }

  /** May `role` perform `action` on `resource`? (role hierarchy applies) */
  can(role: string, resource: string, action: string): Promise<boolean> {
    return this.enforcer.enforce(role, resource, action);
  }
}
