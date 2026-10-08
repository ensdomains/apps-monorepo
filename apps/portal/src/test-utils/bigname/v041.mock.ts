/**
 * Real bigname v0.4.1 responses captured from https://sepolia.api.bigname.sh
 * (build 4e172eb) on 2026-10-05, trimmed to a few rows. `satisfies` checks
 * each one against the wire types, so a type that drifts from what the
 * server sends fails typecheck here.
 */
import type {
  AddressName,
  Envelope,
  EventRow,
  LookupResult,
  NameHistoryRow,
  NameListingRow,
  NameRecord,
  PermissionsResponse,
  Registry,
  RegistryLabel,
  ResolverLink,
  ResolverOverview,
  ResolverRole,
  Subname,
} from '@ens-apps/indexer/bigname'

/** `GET /v1/names/nick.eth`: wrapped, emancipated `.eth` 2LD on `ens_v1`; top-level expiry is the ENSv2 reservation, `ens_v1.expires_at` the lease. */
export const mockNameNick = {
  data: {
    registration_id: '3c5b78a0-5644-5493-bc42-b9dd14fbdca9',
    token_id:
      '42219085255511335250589442208301538195142221433306354426240614732612795430543',
    owner: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
    manager: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
    registered_at: '1733924244',
    created_at: '1692284436',
    expires_at: '1803965433',
    grace_ends_at: '1806384633',
    registration_status: 'wrapped',
    authority: 'ens_v1',
    ens_v1: {
      expires_at: '1798608633',
      wrapper_state: 'emancipated',
      wrapper_fuses: {
        fuses: 196608,
        cannot_unwrap: false,
        cannot_burn_fuses: false,
        cannot_transfer: false,
        cannot_set_resolver: false,
        cannot_set_ttl: false,
        cannot_create_subdomain: false,
        cannot_approve: false,
        parent_cannot_control: true,
        is_dot_eth: true,
        can_extend_expiry: false,
      },
    },
    name: 'nick.eth',
    display_name: 'nick.eth',
    namespace: 'ens',
    namehash:
      '0x05a67c0ee82964c4f7394cdd47fee7f4d9503a23c09c38341779ea012afe6e00',
    resolver: {
      chain_id: 11155111,
      address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd',
    },
    records: {
      seen_addresses: ['60'],
      addresses: {
        '60': '0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5',
      },
      seen_texts: [],
      texts: {},
      seen_abis: [],
      abis: {},
      seen_singletons: [],
      contenthash: null,
      name: null,
    },
    primary_address: '0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5',
    chain_id: 11155111,
    network: 'ethereum-sepolia',
    status: 'ok',
  },
  meta: {
    as_of: {
      '11155111': {
        block_number: 11844764,
        block_hash:
          '0x185503d46a223bd35798f7337fd3bc734b3790157cb68420e4a2f13c748e0404',
        timestamp: '1791150792',
      },
    },
    as_of_token:
      '7b22657468657265756d2d7365706f6c6961223a7b22626c6f636b5f68617368223a22307831383535303364343661323233626433353739386637333337666433626337333462333739303135376362363834323065346132663133633734386530343034222c22626c6f636b5f6e756d626572223a31313834343736342c22636861696e5f6964223a22657468657265756d2d7365706f6c6961222c2274696d657374616d70223a22323032362d31302d30345432313a35333a31325a227d7d',
    source: 'indexed',
  },
} as const satisfies Envelope<NameRecord>

/** `GET /v1/names/weeerewrew.nick.eth`: wrapped subname whose NameWrapper expiry was never set. */
export const mockNameWrappedSub = {
  registration_id: '3a820cbf-d77b-5d50-ad3c-1f2e0d056ca2',
  owner: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  manager: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  created_at: '1736919252',
  expires_at: null,
  expires_at_reason: 'not_set',
  grace_ends_at: null,
  registration_status: 'wrapped',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: null,
    wrapper_state: 'wrapped',
    wrapper_fuses: {
      fuses: 0,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: false,
      is_dot_eth: false,
      can_extend_expiry: false,
    },
  },
  name: 'weeerewrew.nick.eth',
  display_name: 'weeerewrew.nick.eth',
  namespace: 'ens',
  namehash:
    '0x2a77d7dea14c03bd8ac2093608cf5c37babbe759ea8d07954f45e23037b22e31',
  resolver: {
    chain_id: 11155111,
    address: '0x8948458626811dd0c23eb25cc74291247077cc51',
  },
  records: {
    seen_addresses: [],
    addresses: {},
    seen_texts: [],
    texts: {},
    seen_abis: [],
    abis: {},
    seen_singletons: [],
    contenthash: null,
    name: null,
  },
  chain_id: 11155111,
  network: 'ethereum-sepolia',
  status: 'ok',
} as const satisfies NameRecord

/** `GET /v1/names/🚀🚀🚀.eth`: released ENSv1 lease; no `owner`/`manager`, last holder under `lapsed_registration`. */
export const mockNameReleased = {
  registration_id: '72e548e5-6142-5339-a9fd-a40901489561',
  token_id:
    '111711536098804958317211442690176561631475291053998205634446674610911845839179',
  registered_at: '1735633812',
  created_at: '1735633812',
  expires_at: '1767169812',
  grace_ends_at: '1774945812',
  registration_status: 'released',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1767169812',
  },
  lapsed_registration: {
    owner: '0xe073413aeacb8532f50fa00f9e47b7b37f50f442',
    released_at: '1774945824',
    release_kind: 'expired',
  },
  name: '🚀🚀🚀.eth',
  display_name: '🚀️🚀️🚀️.eth',
  namespace: 'ens',
  namehash:
    '0x8b50b6b0bfdea36f1149d2db0416f850c555439892d9464c722a51783fd8b2ae',
  unresolvable_reason: 'no_live_ens_v2_entry',
  chain_id: 11155111,
  network: 'ethereum-sepolia',
  status: 'ok',
  unsupported_fields: ['primary_address'],
} as const satisfies NameRecord

/** `GET /v1/names/leon000.eth`: locked `.eth` 2LD whose ENSv1 lease is in grace; `manager` omitted. */
export const mockNameLockedInGrace = {
  registration_id: 'a48e13ce-d1bc-51a0-a856-78f2b8bb46fb',
  token_id:
    '108592672884086641933062511359735476423777916979796442364765561644909031853496',
  owner: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  registered_at: '1727776908',
  created_at: '1727776908',
  expires_at: '1796205708',
  grace_ends_at: '1798624908',
  registration_status: 'wrapped',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1790848908',
    wrapper_state: 'locked',
    wrapper_fuses: {
      fuses: 196609,
      cannot_unwrap: true,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: true,
      is_dot_eth: true,
      can_extend_expiry: false,
    },
  },
  name: 'leon000.eth',
  display_name: 'leon000.eth',
  namespace: 'ens',
  namehash:
    '0xd59493503a6040cc724a590e4c980cfe8c08e0c01b879c6ef7bc60103c12cd17',
  resolver: {
    chain_id: 11155111,
    address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd',
  },
  records: {
    seen_addresses: ['60'],
    addresses: {
      '60': '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
    },
    seen_texts: [],
    texts: {},
    seen_abis: [],
    abis: {},
    seen_singletons: [],
    contenthash: null,
    name: null,
  },
  primary_address: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  chain_id: 11155111,
  network: 'ethereum-sepolia',
  status: 'ok',
} as const satisfies NameRecord

/** `POST /v1/lookup` `profile=feed` for nick.eth (ens_v1) and fox.eth (ens_v2). */
export const mockLookupFeed = [
  {
    input: {
      name: 'nick.eth',
    },
    kind: 'name',
    status: 'ok',
    record: {
      name: 'nick.eth',
      display_name: 'nick.eth',
      namespace: 'ens',
      namehash:
        '0x05a67c0ee82964c4f7394cdd47fee7f4d9503a23c09c38341779ea012afe6e00',
      expires_at: '1803965433',
      grace_ends_at: '1806384633',
      chain_id: 11155111,
      network: 'ethereum-sepolia',
      ens_v1: {
        expires_at: '1798608633',
        wrapper_state: 'emancipated',
        wrapper_fuses: {
          fuses: 196608,
          cannot_unwrap: false,
          cannot_burn_fuses: false,
          cannot_transfer: false,
          cannot_set_resolver: false,
          cannot_set_ttl: false,
          cannot_create_subdomain: false,
          cannot_approve: false,
          parent_cannot_control: true,
          is_dot_eth: true,
          can_extend_expiry: false,
        },
      },
      status: 'ok',
    },
  },
  {
    input: {
      name: 'fox.eth',
    },
    kind: 'name',
    status: 'ok',
    record: {
      name: 'fox.eth',
      display_name: 'fox.eth',
      namespace: 'ens',
      namehash:
        '0x54cb177469278d1e8e843f0d60633cb4b038af8c4c5be8993161e87ca4a50b4c',
      expires_at: '1793399628',
      grace_ends_at: '1795818828',
      chain_id: 11155111,
      network: 'ethereum-sepolia',
      status: 'ok',
    },
  },
] as const satisfies readonly LookupResult[]

/** `POST /v1/lookup` `profile=detail` for fox.eth (native ENSv2). */
export const mockLookupDetailFox = {
  input: {
    name: 'fox.eth',
  },
  kind: 'name',
  status: 'ok',
  record: {
    name: 'fox.eth',
    display_name: 'fox.eth',
    namespace: 'ens',
    namehash:
      '0x54cb177469278d1e8e843f0d60633cb4b038af8c4c5be8993161e87ca4a50b4c',
    registration_id: 'f974b0ec-dfb3-5630-8845-89252a6d5d23',
    token_id:
      '40973060003111973084034362394916021868123560901440915969294614106835953684222',
    owner: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    manager: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    registered_at: '1790980428',
    created_at: '1713615816',
    expires_at: '1793399628',
    grace_ends_at: '1795818828',
    registration_status: 'registered',
    resolver: {
      chain_id: 11155111,
      address: '0x3df10566a3f1b90dd692b49ec6f3653f5bce6cff',
    },
    records: {
      seen_addresses: ['60'],
      addresses: {
        '60': '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
      },
      seen_texts: [],
      texts: {},
      seen_abis: [],
      abis: {},
      seen_singletons: [],
      contenthash: null,
      name: null,
    },
    primary_address: '0x7bc153b2a4c8a2f3428bd0da77a901b81c6dd809',
    chain_id: 11155111,
    network: 'ethereum-sepolia',
    authority: 'ens_v2',
    status: 'ok',
  },
} as const satisfies LookupResult

/** `POST /v1/lookup` reverse input, `relation=owner,manager`, `profile=feed`. */
export const mockLookupReverseFeed = {
  input: {
    address: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
    coin_type: 60,
    relation: 'owner,manager',
    page_size: 2,
  },
  kind: 'address',
  status: 'ok',
  records: [
    {
      name: 'newname001.eth',
      display_name: 'newname001.eth',
      namespace: 'ens',
      namehash:
        '0xbb49ed1b7935f19d99c1cfbc0be797924c53ae33b66c5f13ff15f6b522eec4f1',
      expires_at: '2013742980',
      grace_ends_at: '2016162180',
      chain_id: 11155111,
      network: 'ethereum-sepolia',
      is_primary: true,
      relations: ['owner', 'manager'],
      ens_v1: {
        expires_at: '2008386180',
      },
      status: 'ok',
    },
  ],
  page: {
    cursor: null,
    next_cursor: 'c1',
    page_size: 2,
    total_count: 18,
    has_more: true,
  },
} as const satisfies LookupResult

/** `GET /v1/addresses/0x03ba…/names?relation=any&include=counts,role_summary`. */
export const mockAddressNameRoleSummary = {
  name: 'allada.eth',
  display_name: 'allada.eth',
  namespace: 'ens',
  namehash:
    '0x0a7f6281facf50ea7c464d2b31c44dc48b5a040ab1c28ac74e803961a1c6d5ee',
  permission_resource_id: 'd3d72c35-3bc0-5082-8cba-737570c411fa',
  owner: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  manager: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  registration_status: 'wrapped',
  registered_at: '1786015536',
  created_at: '1786015536',
  expires_at: '1796560233',
  grace_ends_at: '1798979433',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1791203433',
    wrapper_state: 'emancipated',
    wrapper_fuses: {
      fuses: 196608,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: true,
      is_dot_eth: true,
      can_extend_expiry: false,
    },
  },
  relations: ['owner', 'manager'],
  is_primary: false,
  subname_count: 0,
  role_summary: [
    {
      address: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
      grants: [
        {
          grant_scope: {
            detail: {},
            kind: 'registration',
          },
          powers: [
            'registration_control',
            'set_resolver',
            'set_ttl',
            'create_subnames',
            'transfer',
            'unwrap',
            'burn_fuses',
            'approve',
            'extend_subname_expiry',
          ],
        },
      ],
    },
  ],
  restrictions: {
    kind: 'ens_v1_wrapper',
    registration_id: 'd3d72c35-3bc0-5082-8cba-737570c411fa',
    wrapper_state: 'emancipated',
    wrapper_fuses: {
      fuses: 196608,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: true,
      is_dot_eth: true,
      can_extend_expiry: false,
    },
    wrapper_expires_at: '1798979433',
  },
} as const satisfies AddressName

/** `GET /v1/addresses/0xe073…/names?relation=former_owner`. */
export const mockAddressNameFormerOwner = {
  name: '🚀🚀🚀.eth',
  display_name: '🚀️🚀️🚀️.eth',
  namespace: 'ens',
  namehash:
    '0x8b50b6b0bfdea36f1149d2db0416f850c555439892d9464c722a51783fd8b2ae',
  permission_resource_id: '1fbd0e10-4c61-591d-9bd0-26fb604b1fb7',
  registration_status: 'released',
  registered_at: '1735633812',
  created_at: '1735633812',
  expires_at: '1767169812',
  grace_ends_at: '1774945812',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1767169812',
  },
  relations: ['former_owner'],
  is_primary: false,
  lapsed_registration: {
    owner: '0xe073413aeacb8532f50fa00f9e47b7b37f50f442',
    released_at: '1774945824',
    release_kind: 'expired',
  },
} as const satisfies AddressName

/** `GET /v1/addresses/0x03ba…/names?relation=role_holder`: migrated ENSv2 name. */
export const mockAddressNameRoleHolder = {
  name: 'asnalia.eth',
  display_name: 'asnalia.eth',
  namespace: 'ens',
  namehash:
    '0xa9a43afef6a466fb78cc84ffde32cfd9304f551512b4b43c8a8d7dae611cf06e',
  permission_resource_id: 'fe700a8c-b11b-5f43-92bf-0e96a69ab5b5',
  owner: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  manager: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  registration_status: 'registered',
  registered_at: '1786015584',
  created_at: '1786015584',
  expires_at: '1796908956',
  grace_ends_at: '1799328156',
  authority: 'ens_v2',
  migrated_at: '1790947464',
  relations: ['role_holder'],
  is_primary: false,
} as const satisfies AddressName

/** `GET /v1/addresses/0xb8c2…/names?relation=resolves_to&coin_type=evm`. */
export const mockAddressNameResolvesEvm = {
  name: 'nick.eth',
  display_name: 'nick.eth',
  namespace: 'ens',
  namehash:
    '0x05a67c0ee82964c4f7394cdd47fee7f4d9503a23c09c38341779ea012afe6e00',
  permission_resource_id: '3c5b78a0-5644-5493-bc42-b9dd14fbdca9',
  owner: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  manager: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  registration_status: 'wrapped',
  registered_at: '1733924244',
  created_at: '1692284436',
  expires_at: '1803965433',
  grace_ends_at: '1806384633',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1798608633',
    wrapper_state: 'emancipated',
    wrapper_fuses: {
      fuses: 196608,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: true,
      is_dot_eth: true,
      can_extend_expiry: false,
    },
  },
  relations: ['resolves_to'],
  is_primary: false,
  resolutions: [
    {
      coin_type: 60,
      record_key: 'addr:60',
    },
  ],
} as const satisfies AddressName

/** `GET /v1/addresses/0x5c7b…/names?authority=ens_v1,ens_v0`: registry child with no name row. */
export const mockAddressNameRegistryChild = {
  name: 'sub005.leon.eth',
  display_name: 'sub005.leon.eth',
  namespace: 'ens',
  namehash:
    '0x380f1f83ebc4643c2f5e31948c8a56dbc52f816cadad69d77f208f4c23469e74',
  permission_resource_id: '0edacca4-802e-57f5-b723-1775591dad97',
  owner: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  manager: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  registration_status: 'unregistered',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: null,
  },
  relations: ['owner', 'manager'],
  is_primary: false,
} as const satisfies AddressName

/** `GET /v1/names?parent=eth&authority=ens_v0,ens_v1&…`: wrapped lease in grace, no `manager`. */
export const mockNamesSweepRow = {
  name: 'robotico.eth',
  display_name: 'robotico.eth',
  namespace: 'ens',
  namehash:
    '0xe35a0f4ed8f6c8cff289d8f34b10fdb2b28a70c4dd19112a898bc32aa0880a5c',
  owner: '0x898389cbd63c6acb13beb17c6c27c0973e28abb8',
  registration_status: 'wrapped',
  registered_at: '1754319576',
  created_at: '1754319576',
  expires_at: '1791212376',
  grace_ends_at: '1793631576',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1785855576',
    wrapper_state: 'emancipated',
    wrapper_fuses: {
      fuses: 196608,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: true,
      is_dot_eth: true,
      can_extend_expiry: false,
    },
  },
} as const satisfies NameListingRow

/** `GET /v1/names?…`: released row with `lapsed_registration`. */
export const mockNamesReleasedRow = {
  name: '0xfliz.eth',
  display_name: '0xfliz.eth',
  namespace: 'ens',
  namehash:
    '0x259dd157d0e04643aab71f3ea53f947c6725b19cf163f06736d22fb1df32f434',
  registration_status: 'released',
  registered_at: '1748492592',
  created_at: '1748492592',
  expires_at: '1780028592',
  grace_ends_at: '1787804592',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1780028592',
  },
  lapsed_registration: {
    owner: '0xa51ec73b30e668b4b16634085b0764c5d8241c91',
    released_at: '1787804604',
    release_kind: 'expired',
  },
} as const satisfies NameListingRow

/** `GET /v1/search?q=nalia&match=contains`. */
export const mockSearchRow = {
  name: 'alnalia.eth',
  display_name: 'alnalia.eth',
  namespace: 'ens',
  namehash:
    '0x75ac18b8ca5776f0b94ab549c48acdbe4181ac64b4505a022c3fb7c984f0edbc',
  owner: '0xf83fe2658f702a072f3c7b0dc4a0ab8c7b044750',
  manager: '0xf83fe2658f702a072f3c7b0dc4a0ab8c7b044750',
  registration_status: 'active',
  registered_at: '1786015536',
  created_at: '1786015536',
  expires_at: '1788434736',
  grace_ends_at: '1796210736',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: '1788434736',
  },
} as const satisfies NameListingRow

/** `GET /v1/names/newname001.eth/subnames`: bracketed placeholder child. */
export const mockSubnamePlaceholder = {
  name: '[562b8c0453bc9f0e07aaf28fba8fb8a1f42848390f4c833c331fe45c43b80726].newname001.eth',
  display_name:
    '[562b8c0453bc9f0e07aaf28fba8fb8a1f42848390f4c833c331fe45c43b80726].newname001.eth',
  namespace: 'ens',
  namehash:
    '0xe52a60fac03a1c9caad5190bbb00b26c51256b79553005d48ff51d21fec66dd5',
  labelhash:
    '0x562b8c0453bc9f0e07aaf28fba8fb8a1f42848390f4c833c331fe45c43b80726',
  owner: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  manager: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
  registration_status: 'unregistered',
  authority: 'ens_v1',
  ens_v1: {
    expires_at: null,
  },
} as const satisfies Subname

/** `GET /v1/registries/11155111/0xd4eb…/labels?include=counts`. */
export const mockRegistryLabel = {
  name: '00100.eth',
  display_name: '00100.eth',
  namespace: 'ens',
  namehash:
    '0xcab221c63714afffd525d7e78e79da23cc6f3510978667b88c60b4b406ec1e09',
  labelhash:
    '0x8b8411000c92dc12af29dda403293bc462531200c771991f4f6d018a0e2dace9',
  owner: '0x768a8b6748b907c96e10dab3aaf466f27dc243fc',
  manager: '0x768a8b6748b907c96e10dab3aaf466f27dc243fc',
  registration_status: 'registered',
  registered_at: '1791118944',
  created_at: '1731416400',
  expires_at: '1885813344',
  grace_ends_at: '1888232544',
  authority: 'ens_v2',
  subname_count: 0,
  role_holder_count: 1,
} as const satisfies RegistryLabel

/** `GET /v1/names/asnalia.eth/history?include=data,raw`: `migration` row. */
export const mockHistoryMigration = {
  id: '308dcaa79b55924fa96b2fcddb1c955269f302e6a10484bed4473370427fa427',
  type: 'migration',
  name: 'asnalia.eth',
  namespace: 'ens',
  registration_id: 'fe700a8c-b11b-5f43-92bf-0e96a69ab5b5',
  block_number: 11829264,
  timestamp: '1790947464',
  transaction_hash:
    '0xc7f5a97ce066352289042c713f20864c5863333b7813d63600e0479bddc0b0e3',
  log_index: 258,
  contract_address: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
  data: {
    migration_path: 'unlocked_wrapped',
  },
  kind: 'MigrationApplied',
} as const satisfies NameHistoryRow

/** Same read: the ENSv2 registration the migration linked. */
export const mockHistoryRegistration = {
  id: '0dc0e52c3163561bb850f36be20a79db9410bd5c90f4d7a64e74fd607994663e',
  type: 'registration',
  name: 'asnalia.eth',
  namespace: 'ens',
  registration_id: 'fe700a8c-b11b-5f43-92bf-0e96a69ab5b5',
  block_number: 11829264,
  timestamp: '1790947464',
  transaction_hash:
    '0xc7f5a97ce066352289042c713f20864c5863333b7813d63600e0479bddc0b0e3',
  log_index: 260,
  contract_address: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
  data: {
    action_id:
      '34b53191109af692c75fd554f5f68357f3d601527be8041333c482d8b1bc303a',
    action_role: 'linked',
    expires_at: '1796908956',
    registrant: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  },
  kind: 'RegistrationGranted',
} as const satisfies NameHistoryRow

/** `GET /v1/events?contract_address=<ENSv2 root registry>&type=permission&include=data,raw`: a role change on the root registry `reverse` token. */
export const mockHistoryRootPermission = {
  id: '725ebe0db483e7ac001481b9e242da454d9f3056c63c55e3e2cdc033a23f6ebd',
  type: 'permission',
  name: 'reverse',
  namespace: 'ens',
  registration_id: 'abdcdcab-ed1a-52b7-901b-daa26038d2c4',
  block_number: 11820428,
  timestamp: '1790840916',
  transaction_hash:
    '0x16aa4f19b8a0e7cc331a253f1254abeabcd1fb4848a48ea89134a5d130c5992c',
  log_index: 129,
  contract_address: '0xb458d6a3a77919449d03e7a6903c26827c1ec43f',
  data: {
    added_powers: [],
    address: '0x84d3a426d4e12e955d1df95db0b24fe26afe39d3',
    grant_scope: {
      detail: {},
      kind: 'registry',
    },
    powers: [
      'registrar',
      'register_reserved',
      'set_parent',
      'unregister',
      'renew',
      'set_subregistry',
      'set_resolver',
      'was_reserved',
      'set_uri',
      'can_name',
      'upgrade',
    ],
    removed_powers: [
      'admin_registrar',
      'admin_register_reserved',
      'admin_set_parent',
      'admin_unregister',
      'admin_renew',
      'admin_set_subregistry',
      'admin_set_resolver',
      'can_transfer_admin',
      'admin_set_uri',
      'admin_can_name',
      'admin_upgrade',
    ],
  },
  kind: 'PermissionChanged',
} as const satisfies EventRow

/** `GET /v1/names/nick.eth/history?record_key=addr:60&include=data,raw`. */
export const mockHistoryRecord = {
  id: 'd587f3ad3a82c5a6c06b56dbecd75233439bf6596a3adbcf48a6adf00d686390',
  type: 'record',
  name: 'nick.eth',
  namespace: 'ens',
  registration_id: 'c503323d-bf81-5bae-9a87-b4f66f2a5fec',
  block_number: 4107419,
  timestamp: '1692284436',
  transaction_hash:
    '0xe8fee0cf99682e7e50ee1e142c5fe537b1cb9f48cb6ea4e02f15e61d299d62ed',
  log_index: 21,
  contract_address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd',
  data: {
    coin_type: 60,
    key: 'addr:60',
    node: '0x05a67c0ee82964c4f7394cdd47fee7f4d9503a23c09c38341779ea012afe6e00',
    resolver: {
      address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd',
      chain_id: 11155111,
    },
    value: '0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5',
  },
  kind: 'RecordChanged',
} as const satisfies NameHistoryRow

/** `GET /v1/events?type=primary_name&include=data,raw`. */
export const mockEventPrimaryName = {
  id: '9ca3cdb408ed4a7a74c5928395ae138404d1ca4e7e84aad17328515d41f3bdda',
  type: 'primary_name',
  namespace: 'ens',
  registration_id: null,
  block_number: 11844754,
  timestamp: '1791150660',
  transaction_hash:
    '0xdaf78ef5020cf8f4119299f7b680322b0d6ce38935dab7ab1d40e0a47bb56764',
  log_index: 715,
  contract_address: '0x4f382928805ba0e23b30cfb75fc9e848e82dfd47',
  data: {
    address: '0xc1543c664015f629decb78738018d50c163a2a4a',
    coin_type: 2147483648,
    name: 'overidealizing.eth',
    name_status: 'set',
  },
  kind: 'ReverseChanged',
} as const satisfies EventRow

/** `GET /v1/addresses/0x03ba…/history?relation=role_holder&include=data,raw`: record-ID write with no `name`. */
export const mockAddressHistoryRecordWithoutName = {
  id: '1b32180043c656f99c7d54b97eaccd4d3616dd2d2b30de48b489ea89c6d36399',
  type: 'record',
  namespace: 'ens',
  registration_id: null,
  block_number: 11834307,
  timestamp: '1791011904',
  transaction_hash:
    '0xf500b60527d41ecbeecca31ce41ef700a65737879324bc3e09cfe7de91216e1a',
  log_index: 111,
  contract_address: '0x45600dad96384a0a2a0a9ac9287d943bcfcf3ef9',
  data: {
    key: 'text:avatar',
    record_id: '5',
    resolver: {
      address: '0x45600dad96384a0a2a0a9ac9287d943bcfcf3ef9',
      chain_id: 11155111,
    },
    value:
      'https://avatar-upload-staging.ens-cf.workers.dev/sepolia/yoginth.eth',
  },
  kind: 'RecordChanged',
} as const satisfies EventRow

/** `GET /v1/resolvers/11155111/0x4560…?page_size=2` (one bound name kept). */
export const mockResolverOverview = {
  chain_id: 11155111,
  address: '0x45600dad96384a0a2a0a9ac9287d943bcfcf3ef9',
  bound_names: {
    data: [
      {
        registration_id: 'fe700a8c-b11b-5f43-92bf-0e96a69ab5b5',
        token_id:
          '52050074688414258695063594972026882329133232433517409799826732549676688182613',
        owner: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
        manager: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
        registered_at: '1786015584',
        created_at: '1786015584',
        expires_at: '1796908956',
        grace_ends_at: '1799328156',
        registration_status: 'registered',
        authority: 'ens_v2',
        name: 'asnalia.eth',
        display_name: 'asnalia.eth',
        namespace: 'ens',
        namehash:
          '0xa9a43afef6a466fb78cc84ffde32cfd9304f551512b4b43c8a8d7dae611cf06e',
        resolver: {
          chain_id: 11155111,
          address: '0x45600dad96384a0a2a0a9ac9287d943bcfcf3ef9',
        },
        chain_id: 11155111,
        network: 'ethereum-sepolia',
        status: 'ok',
        unsupported_fields: ['primary_address'],
      },
    ],
    page: {
      cursor: null,
      next_cursor: 'c1',
      page_size: 2,
      total_count: null,
      has_more: true,
    },
  },
} as const satisfies ResolverOverview

/** `GET /v1/resolvers/11155111/0x4560…/links`. */
export const mockResolverLink = {
  default: false,
  display_name: 'bolala.eth',
  link_event: {
    block_number: 11829264,
    log_index: 263,
    timestamp: '1790947464',
    transaction_hash:
      '0xc7f5a97ce066352289042c713f20864c5863333b7813d63600e0479bddc0b0e3',
  },
  name: 'bolala.eth',
  namehash:
    '0x60470b3223b7685bbefd123f28b3ac957125df6006db141515c501e53d1c9dc1',
  namespace: 'ens',
  record_id: '1',
} as const satisfies ResolverLink

/** `GET /v1/resolvers/11155111/0x4560…/roles`. */
export const mockResolverRole = {
  address: '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef',
  grant_event: {
    block_number: 11829264,
    log_index: 221,
    timestamp: '1790947464',
    transaction_hash:
      '0xc7f5a97ce066352289042c713f20864c5863333b7813d63600e0479bddc0b0e3',
  },
  powers: [
    'set_addr',
    'set_text',
    'set_contenthash',
    'set_abi',
    'set_interface',
    'set_name',
    'set_data',
    'link',
    'can_name',
    'upgrade',
    'admin_set_addr',
    'admin_set_text',
    'admin_set_contenthash',
    'admin_set_abi',
    'admin_set_interface',
    'admin_set_name',
    'admin_set_data',
    'admin_link',
    'admin_can_name',
    'admin_upgrade',
  ],
  registration_id: 'ba20d033-0b15-5dfd-83b4-7fb0ad54bfb6',
} as const satisfies ResolverRole

/** `GET /v1/registries/11155111/0xd4eb…?include=counts` (one reference kept). */
export const mockRegistryEth = {
  chain_id: 11155111,
  address: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
  name: {
    name: 'eth',
    display_name: 'eth',
    namespace: 'ens',
    namehash:
      '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae',
  },
  parent_registry: {
    chain_id: 11155111,
    address: '0xb458d6a3a77919449d03e7a6903c26827c1ec43f',
  },
  created_block_number: 11820399,
  created_at: '1790840568',
  created_transaction_hash:
    '0xb184864aa318c1c22f62dce625a043c42ad96eedf89daa33f842a2c36706faa1',
  created_basis: 'registry_created',
  counts: {
    labels: 699,
    roles: 704,
    events: 13605,
  },
  referenced_by: {
    data: [
      {
        name: 'ana-portable.eth',
        display_name: 'ana-portable.eth',
        namespace: 'ens',
        namehash:
          '0x6206b903bd5bfbe97fba57750749860224ab75e746bead90e8d54779c4e67403',
      },
    ],
    page: {
      cursor: null,
      next_cursor: 'c1',
      page_size: 2,
      total_count: 3,
      has_more: true,
    },
  },
} as const satisfies Registry

/** `GET /v1/permissions?name=nick.eth&include=lineage` (one row kept). */
export const mockPermissionsNick = {
  data: [
    {
      address: '0x5c7b61a99d922e9a4451ed62ebbbedbf1627ab47',
      grant_scope: {
        detail: {
          resolver: {
            address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd',
            chain_id: 11155111,
          },
        },
        kind: 'resolver',
      },
      powers: ['resolver_control'],
      registration_id: '3c5b78a0-5644-5493-bc42-b9dd14fbdca9',
      name: 'nick.eth',
      authority_context: 'current_for_name',
      wrapper_state: 'emancipated',
      wrapper_fuses: {
        fuses: 196608,
        cannot_unwrap: false,
        cannot_burn_fuses: false,
        cannot_transfer: false,
        cannot_set_resolver: false,
        cannot_set_ttl: false,
        cannot_create_subdomain: false,
        cannot_approve: false,
        parent_cannot_control: true,
        is_dot_eth: true,
        can_extend_expiry: false,
      },
      lineage: {
        grant: {
          kind: 'ens_v1_authority',
          relation: 'holder',
        },
      },
    },
  ],
  restrictions: {
    kind: 'ens_v1_wrapper',
    registration_id: '3c5b78a0-5644-5493-bc42-b9dd14fbdca9',
    wrapper_state: 'emancipated',
    wrapper_fuses: {
      fuses: 196608,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: true,
      is_dot_eth: true,
      can_extend_expiry: false,
    },
    wrapper_expires_at: '1806384633',
  },
  meta: {
    as_of: {
      '11155111': {
        block_number: 11844768,
        block_hash:
          '0x5b7755dc32765981b626a4520ab7d5e4772d2f1ef4174b236a030ce580a3445b',
        timestamp: '1791150840',
      },
    },
    completeness: 'partial',
    unsupported_reason: 'permissions_partially_listed',
    unlisted_permission_surfaces: [
      'resolver_approvals',
      'wrapper_parent_control',
    ],
  },
} as const satisfies Omit<PermissionsResponse, 'page'>
