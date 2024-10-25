import {
    Collection,
    CustomizationSettings,
    Site,
    SiteCustomizationSettings,
    Space,
} from '@gitbook/api';
import React from 'react';

import { t } from '@/intl/server';
import { getSpaceLanguage } from '@/intl/server';
import { tcls } from '@/lib/tailwind';

import { HeaderLogo } from './HeaderLogo';
import { SpacesDropdown } from './SpacesDropdown';
import { SearchButton } from '../Search';

/**
 * Header to display on top of the table of contents when the space has no header configured.
 */
export function CompactHeader(props: {
    space: Space;
    site: Site | null;
    spaces: Space[];
    customization: CustomizationSettings | SiteCustomizationSettings;
}) {
    const { space, spaces, site, customization } = props;
    const isMultiVariants = site && spaces.length > 1;

    return (
        <div
            className={tcls(
                'hidden',
                'pr-4',
                'lg:flex',
                'lg:flex-col',
                'flex-wrap',
                'lg:gap-x-5',
                'gap-y-3',
                'dark:shadow-light/1',
                'justify-between',
            )}
        >
            <div className={tcls('flex-grow-0', 'mt-5')}>
                <HeaderLogo site={site} space={space} customization={customization} />
            </div>
            <div
                className={tcls(
                    'flex-shrink-0',
                    'grow-0',
                    'md:grow',
                    'sm:max-w-xs',
                    'lg:mt-2',
                    'lg:mb-8',
                    'lg:max-w-full',
                    'justify-self-end',
                )}
            >
                <React.Suspense fallback={null}>
                    <SearchButton>
                        <span className={tcls('flex-1')}>
                            {t(
                                getSpaceLanguage(customization),
                                customization.aiSearch.enabled ? 'search_or_ask' : 'search',
                            )}
                        </span>
                    </SearchButton>
                </React.Suspense>
            </div>
        </div>
    );
}
