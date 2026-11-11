// Port of Aml.Engine.Services.ServiceLocator (Aml.Engine 4.5.2).
//
// C# identifies a service by its type argument T: the dictionary key is `typeof(T).Name` and the
// fallback lookup tests `s is T`. TypeScript has no run time type arguments, so the generic
// methods take the type as an extra (last) parameter: an interface name ('IQuery', checked with
// implementsInterface) or a class constructor (checked with instanceof, key = constructor name).
// `Register(service)` without a type uses the constructor name of the service, which is the
// static type C# infers in most calls; the engine registers its defaults under 'IQuery' and
// 'ICaexIDService' like the C# static constructor does.

import { T } from '../registry.js';
import { implementsInterface } from '../interfaces.js';
import { DefaultComparer, from, HashSet } from '../../system/linq.js';
import type { IAMLService } from './interfaces/IAMLService.js';
import type { IAutoUpdate } from './interfaces/IAutoUpdate.js';
import type { ICaexIDService } from './interfaces/ICaexIDService.js';
import type { IExternalReferenceResolver } from './interfaces/IExternalReferenceResolver.js';
import type { IGitHubAccessService } from './interfaces/IGitHubAccessService.js';
import type { IQuery } from './interfaces/IQuery.js';
import type { ISchemaTransform } from './interfaces/ISchemaTransform.js';
import type { ISuspendable } from './interfaces/ISuspendable.js';
import type { IUndoRedo } from './interfaces/IUndoRedo.js';
import type { IUniqueName } from './interfaces/IUniqueName.js';
import type { SchemaTransformationEventArgs } from './interfaces/SchemaTransformationEventArgs.js';
import type { CaexIDService } from './CaexIDService.js';
import type { QueryService } from './QueryService.js';

/** The type argument of the generic ServiceLocator methods: an interface name or a class. */
export type ServiceType = string | (abstract new (...args: never[]) => unknown);

function typeName(type: ServiceType): string {
  return typeof type === 'string' ? type : type.name;
}

function isOfType(service: unknown, type: ServiceType): boolean {
  return typeof type === 'string' ? implementsInterface(service, type) : service instanceof type;
}

interface LocatorState {
  servicesDictionary: Map<string, IAMLService>;
  defaultQueryService: IQuery;
  defaultCaexIDService: ICaexIDService;
  startedServices: HashSet<IAMLService>;
}

let state: LocatorState | null = null;

// A second copy of the engine in one process (the ESM and the CommonJS entries mixed, or two
// versions of the package) has its own ServiceLocator, registry and document table, so services
// registered in one copy do not act on the documents of the other. The built package (tsup.config.ts
// defines __AMLENGINE_BUILD__) marks the copy it loads and warns once when it finds another one.
declare const __AMLENGINE_BUILD__: string | undefined;
if (typeof __AMLENGINE_BUILD__ !== 'undefined') {
  const key = Symbol.for('amlengine-js.engine');
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (g[key] === undefined) {
    g[key] = __AMLENGINE_BUILD__;
  } else {
    console.warn(
      `amlengine-js: another copy of the engine (${String(g[key])}) is already loaded, now ${__AMLENGINE_BUILD__}. ` +
        'Each copy has its own ServiceLocator and documents: services registered in one copy do not act on ' +
        'documents of the other. Load amlengine-js and amlengine-js/services through the same module system ' +
        '(both import or both require) and in one version.',
    );
  }
}

/** The C# static constructor, run on first use of the ServiceLocator. */
function init(): LocatorState {
  if (state !== null) return state;
  const s: LocatorState = {
    servicesDictionary: new Map<string, IAMLService>(),
    startedServices: new HashSet<IAMLService>(),
    defaultQueryService: new T.QueryService(),
    defaultCaexIDService: new T.CaexIDService(),
  };
  state = s;
  ServiceLocator.register(s.defaultQueryService, 'IQuery');
  ServiceLocator.register(s.defaultCaexIDService, 'ICaexIDService');
  return s;
}

function transform_TransformationEnded(_sender: unknown, e: SchemaTransformationEventArgs): void {
  e.targetDocument!.finalizeSchemaTransformation();
}

function transform_TransformationStarted(_sender: unknown, e: SchemaTransformationEventArgs): void {
  e.targetDocument = e.sourceDocument!.transformToSchema(e.targetSchema);
}

/** Static registry of the services used by the engine. */
export class ServiceLocator {
  private constructor() {}

  /** All registered services by type name. */
  static get servicesDictionary(): Map<string, IAMLService> {
    return init().servicesDictionary;
  }

  /** The registered auto update service, if any. */
  static get autoUpdateService(): IAutoUpdate | null {
    return ServiceLocator.getService<IAutoUpdate>('IAutoUpdate');
  }

  /** The registered external reference resolver, if any. */
  static get externalReferenceResolverService(): IExternalReferenceResolver | null {
    return ServiceLocator.getService<IExternalReferenceResolver>('IExternalReferenceResolver');
  }

  /** The registered query service (the default QueryService unless replaced). */
  static get queryService(): IQuery {
    return ServiceLocator.getService<IQuery>('IQuery')!;
  }

  /** The registered ID service (the default CaexIDService unless replaced). */
  static get idService(): ICaexIDService {
    return ServiceLocator.getService<ICaexIDService>('ICaexIDService')!;
  }

  /** The registered undo/redo service, if any. */
  static get undoRedoService(): IUndoRedo | null {
    return ServiceLocator.getService<IUndoRedo>('IUndoRedo');
  }

  /** The registered unique name service, if any. */
  static get uniqueNameService(): IUniqueName | null {
    return ServiceLocator.getService<IUniqueName>('IUniqueName');
  }

  /** The registered GitHub access service, if any. */
  static get gitHubAccessService(): IGitHubAccessService | null {
    return ServiceLocator.getService<IGitHubAccessService>('IGitHubAccessService');
  }

  /** The default query service. */
  static get defaultQueryService(): QueryService {
    return init().defaultQueryService as QueryService;
  }

  /** The default ID service. */
  static get defaultCaexIDService(): CaexIDService {
    return init().defaultCaexIDService as CaexIDService;
  }

  /**
   * Gets the service of the given type or, if none is registered, creates it with `register`
   * and marks it as started by this call. A suspendable service is resumed.
   */
  static beginService<TService extends IAMLService>(register: () => TService, type: ServiceType): { service: TService } {
    const s = init();
    let service = ServiceLocator.getService<TService>(type);
    if (service === null || service === undefined) {
      service = register();
      s.startedServices.add(service);
    }
    if (implementsInterface(service, 'ISuspendable')) {
      (service as unknown as ISuspendable).resume();
    }
    return { service };
  }

  /** Calls `unregister` if the service was started by beginService. */
  static endService(unregister: () => void, service: IAMLService): void {
    if (init().startedServices.remove(service)) {
      unregister();
    }
  }

  /** Gets the registered service of the given type, or null. */
  static getService<TService extends IAMLService>(type: ServiceType): TService | null {
    const s = init();
    const value = s.servicesDictionary.get(typeName(type));
    if (value !== undefined) {
      return value as TService;
    }
    if (s.servicesDictionary.size <= 0) {
      return null;
    }
    const iAMLService = from(s.servicesDictionary.values()).firstOrDefault((x) => isOfType(x, type));
    if (iAMLService !== null) {
      return iAMLService as TService;
    }
    return null;
  }

  /** Registers the service under the name of its type (by default the class name of the service). */
  static register<TService extends IAMLService>(service: TService, type?: ServiceType): void {
    const s = init();
    const key = type !== undefined ? typeName(type) : (service as object).constructor.name;
    s.servicesDictionary.set(key, service);
    if (implementsInterface(service, 'ISchemaTransform')) {
      const schemaTransform = service as unknown as ISchemaTransform;
      schemaTransform.transformationStarted.subscribe(transform_TransformationStarted);
      schemaTransform.transformationEnded.subscribe(transform_TransformationEnded);
    }
  }

  /**
   * Removes the service of the given type. The default query and ID services cannot be removed;
   * removing a replacement restores them.
   */
  static unRegister(type: ServiceType): IAMLService | null {
    const s = init();
    const key = typeName(type);
    const value = s.servicesDictionary.get(key);
    if (value === undefined) {
      return null;
    }
    if (DefaultComparer.equals(value, s.defaultQueryService)) {
      return null;
    }
    if (DefaultComparer.equals(value, s.defaultCaexIDService)) {
      return null;
    }
    s.servicesDictionary.delete(key);
    if (!implementsInterface(value, 'IQuery')) {
      if (!implementsInterface(value, 'ICaexIDService')) {
        if (implementsInterface(value, 'ISchemaTransform')) {
          const schemaTransform = value as unknown as ISchemaTransform;
          schemaTransform.transformationStarted.unsubscribe(transform_TransformationStarted);
          schemaTransform.transformationEnded.unsubscribe(transform_TransformationEnded);
        }
      } else {
        ServiceLocator.register(s.defaultCaexIDService, 'ICaexIDService');
      }
    } else {
      ServiceLocator.register(s.defaultQueryService, 'IQuery');
    }
    return value;
  }
}
