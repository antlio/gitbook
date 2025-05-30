'use client';
// This component does not use any client feature but we don't want to
// render it server-side because it has recursion.

import type { OpenAPICustomOperationProperties, OpenAPIV3 } from '@gitbook/openapi-parser';
import { useId } from 'react';

import clsx from 'clsx';
import { Markdown } from './Markdown';
import { OpenAPICopyButton } from './OpenAPICopyButton';
import { OpenAPIDisclosure } from './OpenAPIDisclosure';
import { OpenAPISchemaName } from './OpenAPISchemaName';
import { retrocycle } from './decycle';
import { stringifyOpenAPI } from './stringifyOpenAPI';
import type { OpenAPIClientContext } from './types';
import { checkIsReference, resolveDescription, resolveFirstExample } from './utils';

type CircularRefsIds = Map<OpenAPIV3.SchemaObject, string>;

export interface OpenAPISchemaPropertyEntry {
    propertyName?: string | undefined;
    required?: boolean | undefined;
    schema: OpenAPIV3.SchemaObject;
}

/**
 * Render a property of an OpenAPI schema.
 */
function OpenAPISchemaProperty(props: {
    property: OpenAPISchemaPropertyEntry;
    context: OpenAPIClientContext;
    circularRefs: CircularRefsIds;
    className?: string;
}) {
    const { circularRefs: parentCircularRefs, context, className, property } = props;

    const { schema } = property;

    const id = useId();

    return (
        <div id={id} className={clsx('openapi-schema', className)}>
            <OpenAPISchemaPresentation property={property} />
            {(() => {
                const circularRefId = parentCircularRefs.get(schema);
                // Avoid recursing infinitely, and instead render a link to the parent schema
                if (circularRefId) {
                    return <OpenAPISchemaCircularRef id={circularRefId} schema={schema} />;
                }

                const circularRefs = new Map(parentCircularRefs);
                circularRefs.set(schema, id);

                const properties = getSchemaProperties(schema);
                if (properties?.length) {
                    return (
                        <OpenAPIDisclosure
                            icon={context.icons.plus}
                            label={(isExpanded) => getDisclosureLabel(schema, isExpanded)}
                        >
                            <OpenAPISchemaProperties
                                properties={properties}
                                circularRefs={circularRefs}
                                context={context}
                            />
                        </OpenAPIDisclosure>
                    );
                }

                const ancestors = new Set(circularRefs.keys());
                const alternatives = getSchemaAlternatives(schema, ancestors);

                if (alternatives) {
                    return alternatives.map((schema, index) => (
                        <OpenAPISchemaAlternative
                            key={index}
                            schema={schema}
                            circularRefs={circularRefs}
                            context={context}
                        />
                    ));
                }

                return null;
            })()}
        </div>
    );
}

/**
 * Render a set of properties of an OpenAPI schema.
 */
function OpenAPISchemaProperties(props: {
    id?: string;
    properties: OpenAPISchemaPropertyEntry[];
    circularRefs?: CircularRefsIds;
    context: OpenAPIClientContext;
}) {
    const {
        id,
        properties,
        circularRefs = new Map<OpenAPIV3.SchemaObject, string>(),
        context,
    } = props;

    return (
        <div id={id} className="openapi-schema-properties">
            {properties.map((property, index) => {
                return (
                    <OpenAPISchemaProperty
                        key={index}
                        circularRefs={circularRefs}
                        property={property}
                        context={context}
                    />
                );
            })}
        </div>
    );
}

export function OpenAPISchemaPropertiesFromServer(props: {
    id?: string;
    properties: string;
    context: OpenAPIClientContext;
}) {
    return (
        <OpenAPISchemaProperties
            id={props.id}
            properties={JSON.parse(props.properties, retrocycle())}
            context={props.context}
        />
    );
}

/**
 * Render a root schema (such as the request body or response body).
 */
function OpenAPIRootSchema(props: {
    schema: OpenAPIV3.SchemaObject;
    context: OpenAPIClientContext;
    circularRefs?: CircularRefsIds;
}) {
    const {
        schema,
        context,
        circularRefs: parentCircularRefs = new Map<OpenAPIV3.SchemaObject, string>(),
    } = props;

    const id = useId();
    const properties = getSchemaProperties(schema);
    const description = resolveDescription(schema);

    if (properties?.length) {
        const circularRefs = new Map(parentCircularRefs);
        circularRefs.set(schema, id);

        return (
            <>
                {description ? (
                    <Markdown source={description} className="openapi-schema-root-description" />
                ) : null}
                <OpenAPISchemaProperties
                    properties={properties}
                    circularRefs={circularRefs}
                    context={context}
                />
            </>
        );
    }

    return (
        <OpenAPISchemaProperty
            className="openapi-schema-root"
            property={{ schema }}
            context={context}
            circularRefs={parentCircularRefs}
        />
    );
}

export function OpenAPIRootSchemaFromServer(props: {
    schema: string;
    context: OpenAPIClientContext;
}) {
    return (
        <OpenAPIRootSchema
            schema={JSON.parse(props.schema, retrocycle())}
            context={props.context}
        />
    );
}

/**
 * Render a tab for an alternative schema.
 * It renders directly the properties if relevant;
 * for primitives, it renders the schema itself.
 */
function OpenAPISchemaAlternative(props: {
    schema: OpenAPIV3.SchemaObject;
    circularRefs: CircularRefsIds;
    context: OpenAPIClientContext;
}) {
    const { schema, circularRefs, context } = props;

    const description = resolveDescription(schema);
    const properties = getSchemaProperties(schema);

    return (
        <>
            {description ? (
                <Markdown source={description} className="openapi-schema-description" />
            ) : null}
            <OpenAPIDisclosure
                icon={context.icons.plus}
                label={(isExpanded) => getDisclosureLabel(schema, isExpanded)}
            >
                {properties?.length ? (
                    <OpenAPISchemaProperties
                        properties={properties}
                        circularRefs={circularRefs}
                        context={context}
                    />
                ) : (
                    <OpenAPISchemaProperty
                        property={{ schema }}
                        circularRefs={circularRefs}
                        context={context}
                    />
                )}
            </OpenAPIDisclosure>
        </>
    );
}

/**
 * Render a circular reference to a schema.
 */
function OpenAPISchemaCircularRef(props: { id: string; schema: OpenAPIV3.SchemaObject }) {
    const { id, schema } = props;

    return (
        <div className="openapi-schema-circular">
            Circular reference to <a href={`#${id}`}>{getSchemaTitle(schema)}</a>{' '}
            <span className="openapi-schema-circular-glyph">↩</span>
        </div>
    );
}

/**
 * Render the enum value for a schema.
 */
function OpenAPISchemaEnum(props: {
    schema: OpenAPIV3.SchemaObject & OpenAPICustomOperationProperties;
}) {
    const { schema } = props;

    const enumValues = (() => {
        // Render x-gitbook-enum first, as it has a different format
        if (schema['x-gitbook-enum']) {
            return Object.entries(schema['x-gitbook-enum']).map(([name, { description }]) => {
                return {
                    value: name,
                    description,
                };
            });
        }

        if (schema['x-enumDescriptions']) {
            return Object.entries(schema['x-enumDescriptions']).map(([value, description]) => {
                return {
                    value,
                    description,
                };
            });
        }

        return schema.enum?.map((value) => {
            return {
                value,
                description: undefined,
            };
        });
    })();

    if (!enumValues?.length) {
        return null;
    }

    return (
        <span className="openapi-schema-enum">
            Available options:{' '}
            {enumValues.map((item, index) => (
                <span key={index} className="openapi-schema-enum-value">
                    <OpenAPICopyButton
                        value={item.value}
                        label={item.description}
                        withTooltip={!!item.description}
                    >
                        <code>{`${item.value}`}</code>
                    </OpenAPICopyButton>
                </span>
            ))}
        </span>
    );
}

/**
 * Render the top row of a schema. e.g: name, type, and required status.
 */
function OpenAPISchemaPresentation(props: { property: OpenAPISchemaPropertyEntry }) {
    const {
        property: { schema, propertyName, required },
    } = props;

    const description = resolveDescription(schema);
    const example = resolveFirstExample(schema);

    return (
        <div className="openapi-schema-presentation">
            <OpenAPISchemaName
                schema={schema}
                type={getSchemaTitle(schema)}
                propertyName={propertyName}
                required={required}
            />
            {typeof schema['x-deprecated-sunset'] === 'string' ? (
                <div className="openapi-deprecated-sunset openapi-schema-description openapi-markdown">
                    Sunset date:{' '}
                    <span className="openapi-deprecated-sunset-date">
                        {schema['x-deprecated-sunset']}
                    </span>
                </div>
            ) : null}
            {description ? (
                <Markdown source={description} className="openapi-schema-description" />
            ) : null}
            {schema.default !== undefined ? (
                <span className="openapi-schema-default">
                    Default:{' '}
                    <code>
                        {typeof schema.default === 'string' && schema.default
                            ? schema.default
                            : stringifyOpenAPI(schema.default)}
                    </code>
                </span>
            ) : null}
            {typeof example === 'string' ? (
                <span className="openapi-schema-example">
                    Example: <code>{example}</code>
                </span>
            ) : null}
            {schema.pattern ? (
                <span className="openapi-schema-pattern">
                    Pattern: <code>{schema.pattern}</code>
                </span>
            ) : null}
            <OpenAPISchemaEnum schema={schema} />
        </div>
    );
}

/**
 * Get the sub-properties of a schema.
 */
function getSchemaProperties(schema: OpenAPIV3.SchemaObject): null | OpenAPISchemaPropertyEntry[] {
    // check array AND schema.items as this is sometimes null despite what the type indicates
    if (schema.type === 'array' && schema.items && !checkIsReference(schema.items)) {
        const items = schema.items;
        const itemProperties = getSchemaProperties(items);
        if (itemProperties) {
            return itemProperties;
        }

        // If the items are a primitive type, we don't need to display them
        if (
            (items.type === 'string' ||
                items.type === 'number' ||
                items.type === 'boolean' ||
                items.type === 'integer') &&
            !items.enum
        ) {
            return null;
        }

        return [{ propertyName: 'items', schema: items }];
    }

    if (schema.type === 'object' || schema.properties) {
        const result: OpenAPISchemaPropertyEntry[] = [];

        if (schema.properties) {
            Object.entries(schema.properties).forEach(([propertyName, propertySchema]) => {
                if (checkIsReference(propertySchema)) {
                    return;
                }

                result.push({
                    propertyName,
                    required: Array.isArray(schema.required)
                        ? schema.required.includes(propertyName)
                        : undefined,
                    schema: propertySchema,
                });
            });
        }

        if (schema.additionalProperties && !checkIsReference(schema.additionalProperties)) {
            result.push({
                propertyName: 'Other properties',
                schema: schema.additionalProperties === true ? {} : schema.additionalProperties,
            });
        }

        return result;
    }

    return null;
}

type AlternativeType = 'oneOf' | 'allOf' | 'anyOf';

/**
 * Get the alternatives to display for a schema.
 */
export function getSchemaAlternatives(
    schema: OpenAPIV3.SchemaObject,
    ancestors: Set<OpenAPIV3.SchemaObject> = new Set()
): OpenAPIV3.SchemaObject[] | null {
    const alternatives:
        | [AlternativeType, (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[]]
        | null = (() => {
        if (schema.anyOf) {
            return ['anyOf', schema.anyOf];
        }

        if (schema.oneOf) {
            return ['oneOf', schema.oneOf];
        }

        if (schema.allOf) {
            return ['allOf', schema.allOf];
        }

        return null;
    })();

    if (!alternatives) {
        return null;
    }

    const [type, schemas] = alternatives;
    return flattenAlternatives(type, schemas, new Set(ancestors).add(schema));
}

function flattenAlternatives(
    alternativeType: AlternativeType,
    schemasOrRefs: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[],
    ancestors: Set<OpenAPIV3.SchemaObject>
): OpenAPIV3.SchemaObject[] {
    return schemasOrRefs.reduce<OpenAPIV3.SchemaObject[]>((acc, schemaOrRef) => {
        if (checkIsReference(schemaOrRef)) {
            return acc;
        }

        if (schemaOrRef[alternativeType] && !ancestors.has(schemaOrRef)) {
            const schemas = getSchemaAlternatives(schemaOrRef, ancestors);
            if (schemas) {
                acc.push(...schemas);
            }
            return acc;
        }

        acc.push(schemaOrRef);
        return acc;
    }, []);
}

function getSchemaTitle(schema: OpenAPIV3.SchemaObject): string {
    // Otherwise try to infer a nice title
    let type = 'any';

    if (schema.enum || schema['x-enumDescriptions'] || schema['x-gitbook-enum']) {
        type = `${schema.type} · enum`;
        // check array AND schema.items as this is sometimes null despite what the type indicates
    } else if (schema.type === 'array' && !!schema.items) {
        type = `${getSchemaTitle(schema.items)}[]`;
    } else if (Array.isArray(schema.type)) {
        type = schema.type.join(' | ');
    } else if (schema.type || schema.properties) {
        type = schema.type ?? 'object';

        if (schema.format) {
            type += ` · ${schema.format}`;
        }
    }

    if ('anyOf' in schema) {
        type = 'any of';
    } else if ('oneOf' in schema) {
        type = 'one of';
    } else if ('allOf' in schema) {
        type = 'all of';
    } else if ('not' in schema) {
        type = 'not';
    }

    return type;
}

function getDisclosureLabel(schema: OpenAPIV3.SchemaObject, isExpanded: boolean) {
    let label: string;
    if (schema.type === 'array' && !!schema.items) {
        if (schema.items.oneOf) {
            label = 'available items';
        }
        // Fallback to "child attributes" for enums and objects
        else if (schema.items.enum || schema.items.type === 'object') {
            label = 'child attributes';
        } else {
            label = schema.items.title ?? schema.title ?? getSchemaTitle(schema.items);
        }
    } else {
        label = schema.title || 'child attributes';
    }

    return `${isExpanded ? 'Hide' : 'Show'} ${label}`;
}
