const { expect } = require('chai');
const uuid4 = require('uuid/v4');
const Index = require('../../../../src/index');
const { registerEntitiesForIndex } = require('../../../util');

describe('Testing Rest Query', () => {
  let index;

  beforeEach(() => {
    index = Index({ endpoint: process.env.elasticsearchEndpoint });
    registerEntitiesForIndex(index);
  });

  describe('Testing Query Filter', () => {
    it('Testing property type "object" fully returned', async () => {
      const offerId = uuid4();
      expect(await index.rest.mapping.create('offer')).to.equal(true);
      expect(await index.rest.data.update('offer', {
        upsert: [index.data.remap('offer', {
          id: offerId,
          meta: {
            k1: 'v1',
            k2: ['v2'],
            k3: []
          }
        })]
      })).to.equal(true);
      expect(await index.rest.data.refresh('offer')).to.equal(true);
      const filter = index.query.build('offer', {
        toReturn: ['id', 'meta'],
        filterBy: { and: [['id', '==', offerId]] },
        limit: 1,
        offset: 0
      });
      const queryResult = await index.rest.data.query('offer', filter);
      expect(index.data.page(queryResult, filter)).to.deep.equal({
        payload: [{
          id: offerId,
          meta: {
            k1: 'v1',
            k2: ['v2'],
            k3: []
          }
        }],
        page: {
          next: { limit: 1, offset: 1, cursor: 'eyJsaW1pdCI6MSwib2Zmc2V0IjoxfQ==' },
          previous: null,
          index: {
            max: 1,
            current: 1
          },
          size: 1
        }
      });
      // cleanup
      expect(await index.rest.mapping.delete('offer')).to.equal(true);
    });

    it('Testing property type "geo_shape" returned as list', async () => {
      const offerId = uuid4();
      const coordinates = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
      expect(await index.rest.mapping.create('offer'), 'create').to.equal(true);
      expect(await index.rest.data.update('offer', {
        upsert: [{
          id: offerId,
          locations: [
            { address: { area: { type: 'Polygon', coordinates: [coordinates] } } },
            { address: { area: null } }
          ]
        }]
      }), 'Insert').to.equal(true);
      expect(await index.rest.data.refresh('offer')).to.equal(true);
      const filter = index.query.build('offer', {
        toReturn: ['id', 'locations.address.area'],
        filterBy: { and: [['id', '==', offerId]] },
        limit: 1,
        offset: 0
      });
      const queryResult = await index.rest.data.query('offer', filter);
      expect(index.data.page(queryResult, filter)).to.deep.equal({
        payload: [{
          id: offerId,
          locations: [
            { address: { area: coordinates } },
            { address: { area: null } }
          ]
        }],
        page: {
          next: { limit: 1, offset: 1, cursor: 'eyJsaW1pdCI6MSwib2Zmc2V0IjoxfQ==' },
          previous: null,
          index: {
            max: 1,
            current: 1
          },
          size: 1
        }
      });
      // cleanup
      expect(await index.rest.mapping.delete('offer')).to.equal(true);
    });

    it('Testing empty relationship returned as empty list.', async () => {
      const offerId = uuid4();
      expect(await index.rest.mapping.create('offer')).to.equal(true);
      expect(await index.rest.data.update('offer', {
        upsert: [{
          id: offerId,
          locations: []
        }]
      })).to.equal(true);
      expect(await index.rest.data.refresh('offer')).to.equal(true);
      const filter = index.query.build('offer', {
        toReturn: ['id', 'locations.name'],
        filterBy: { and: [['id', '==', offerId]] },
        limit: 1,
        offset: 0
      });
      const queryResult = await index.rest.data.query('offer', filter);
      expect(index.data.page(queryResult, filter)).to.deep.equal({
        payload: [{
          id: offerId,
          locations: []
        }],
        page: {
          next: { limit: 1, offset: 1, cursor: 'eyJsaW1pdCI6MSwib2Zmc2V0IjoxfQ==' },
          previous: null,
          index: {
            max: 1,
            current: 1
          },
          size: 1
        }
      });
      // cleanup
      expect(await index.rest.mapping.delete('offer')).to.equal(true);
    });
  });

  describe('Testing nested filtering', () => {
    it('Testing allow separate relationships', async () => {
      const offerId = uuid4();
      expect(await index.rest.mapping.recreate('offer')).to.equal(true);
      expect(await index.rest.data.update('offer', {
        upsert: [{
          id: offerId,
          locations: [{
            id: uuid4(),
            address: { id: uuid4(), street: 'value1', city: 'value1' }
          }, {
            id: uuid4(),
            address: { id: uuid4(), street: 'value2', city: 'value2' }
          }]
        }]
      })).to.equal(true);
      expect(await index.rest.data.refresh('offer')).to.equal(true);
      const filter1 = index.query.build('offer', {
        filterBy: {
          target: 'union',
          and: ['locations.address.street == value1', 'locations.address.city == value2']
        }
      });
      const queryResult1 = await index.rest.data.query('offer', filter1);
      expect((index.data.page(queryResult1, filter1)).payload.length).to.equal(1);
      const filter2 = index.query.build('offer', {
        filterBy: {
          target: 'separate',
          and: ['locations.address.street == value1', 'locations.address.city == value2']
        }
      });
      const queryResult2 = await index.rest.data.query('offer', filter2);
      expect((index.data.page(queryResult2, filter2)).payload.length).to.equal(0);
      // cleanup
      expect(await index.rest.mapping.delete('offer')).to.equal(true);
    }).timeout(10000);

    it('Testing nested filtered in sort', async () => {
      const offerIds = [uuid4(), uuid4(), uuid4(), uuid4()];
      expect(await index.rest.mapping.recreate('offer')).to.equal(true);
      expect(await index.rest.data.update('offer', {
        upsert: [{
          id: offerIds[0],
          headline: 'First',
          locations: [
            { id: uuid4(), name: '1', address: { id: uuid4(), street: 'A' } },
            { id: uuid4(), name: '1', address: { id: uuid4(), street: 'B' } }
          ]
        }, {
          id: offerIds[2],
          headline: 'Second',
          locations: [
            { id: uuid4(), name: '1', address: { id: uuid4(), street: 'A' } },
            { id: uuid4(), name: '2', address: { id: uuid4(), street: 'B' } }
          ]
        }, {
          id: offerIds[1],
          headline: 'Third',
          locations: [
            { id: uuid4(), name: '2', address: { id: uuid4(), street: 'A' } },
            { id: uuid4(), name: '1', address: { id: uuid4(), street: 'B' } }
          ]
        }, {
          id: offerIds[3],
          headline: 'Fourth',
          locations: [
            { id: uuid4(), name: '2', address: { id: uuid4(), street: 'A' } },
            { id: uuid4(), name: '2', address: { id: uuid4(), street: 'B' } }
          ]
        }].sort(() => Math.random() - 0.5)
      })).to.equal(true);
      expect(await index.rest.data.refresh('offer')).to.equal(true);
      const filter = index.query.build('offer', {
        orderBy: [
          ['locations.name', 'asc', 'max', { and: [['locations.address.street', '==', 'A']] }],
          ['locations.name', 'asc', 'max', { and: [['locations.address.street', '==', 'B']] }]
        ],
        toReturn: ['headline']
      });
      const queryResult = await index.rest.data.query('offer', filter);
      expect(queryResult.hits.hits).to.deep.equal([
        {
          _index: 'offer@229a59500f278ce9d4cd24ce6afc4e191845a937',
          _type: 'offer',
          _id: offerIds[0],
          _score: null,
          _source: { headline: 'First' },
          sort: ['1', '1', offerIds[0]]
        },
        {
          _index: 'offer@229a59500f278ce9d4cd24ce6afc4e191845a937',
          _type: 'offer',
          _id: offerIds[2],
          _score: null,
          _source: { headline: 'Second' },
          sort: ['1', '2', offerIds[2]]
        },
        {
          _index: 'offer@229a59500f278ce9d4cd24ce6afc4e191845a937',
          _type: 'offer',
          _id: offerIds[1],
          _score: null,
          _source: { headline: 'Third' },
          sort: ['2', '1', offerIds[1]]
        },
        {
          _index: 'offer@229a59500f278ce9d4cd24ce6afc4e191845a937',
          _type: 'offer',
          _id: offerIds[3],
          _score: null,
          _source: { headline: 'Fourth' },
          sort: ['2', '2', offerIds[3]]
        }
      ]);
      // cleanup
      expect(await index.rest.mapping.delete('offer')).to.equal(true);
    }).timeout(10000);
  });

  it('Testing twice nested empty relationship returned as empty list.', async () => {
    const offerId = uuid4();
    const locationId = uuid4();
    expect(await index.rest.mapping.recreate('offer')).to.equal(true);
    expect(await index.rest.data.update('offer', {
      upsert: [{
        id: offerId,
        locations: [
          {
            id: locationId,
            tags: []
          }
        ]
      }]
    })).to.equal(true);
    expect(await index.rest.data.refresh('offer')).to.equal(true);
    const filter = index.query.build('offer', {
      toReturn: ['id', 'locations.tags.name'],
      filterBy: { and: [['id', '==', offerId]] },
      limit: 1,
      offset: 0
    });
    const queryResult = await index.rest.data.query('offer', filter);
    expect(index.data.page(queryResult, filter)).to.deep.equal({
      payload: [{
        id: offerId,
        locations: [{ tags: [] }]
      }],
      page: {
        next: { limit: 1, offset: 1, cursor: 'eyJsaW1pdCI6MSwib2Zmc2V0IjoxfQ==' },
        previous: null,
        index: {
          max: 1,
          current: 1
        },
        size: 1
      }
    });
    // cleanup
    expect(await index.rest.mapping.delete('offer')).to.equal(true);
  });

  describe('Testing orderBy', () => {
    it('Testing "mode" for asc, desc', async () => {
      expect(await index.rest.mapping.recreate('offer')).to.equal(true);
      await Promise.all([
        {
          orderBy: [['id', 'desc', 'max']],
          result: { sort: [{ id: { mode: 'max', order: 'desc' } }] }
        },
        {
          orderBy: [['id', 'desc', 'min']],
          result: { sort: [{ id: { mode: 'min', order: 'desc' } }] }
        },
        {
          orderBy: [['id', 'asc', 'max']],
          result: { sort: [{ id: { mode: 'max', order: 'asc' } }] }
        },
        {
          orderBy: [['id', 'asc', 'min']],
          result: { sort: [{ id: { mode: 'min', order: 'asc' } }] }
        }
      ].map(async ({ orderBy, result }) => {
        expect(await index.query.build('offer', { toReturn: ['id'], orderBy })).to.deep.contain(result);
      }));
    });
  });

  describe('Testing sorting by score', () => {
    it('Testing existence in array sorting', async () => {
      const offer1 = {
        id: uuid4(),
        flags: ['one', 'two']
      };
      const offer2 = {
        id: uuid4(),
        flags: ['one', 'three']
      };
      expect(await index.rest.mapping.recreate('offer')).to.equal(true);
      expect(await index.rest.data.update('offer', { upsert: [offer1, offer2] })).to.equal(true);
      expect(await index.rest.data.refresh('offer')).to.equal(true);
      await Promise.all([
        {
          scoreBy: [['==', 'flags', 'three']],
          result: [offer2, offer1]
        },
        {
          scoreBy: [['==', 'flags', 'one'], ['==', 'flags', 'two']],
          result: [offer1, offer2]
        },
        {
          scoreBy: [['==', 'flags', 'two', 3], ['==', 'flags', 'three', 1]],
          result: [offer1, offer2]
        }
      ].map(async ({ scoreBy, result }) => {
        const filter = await index.query.build('offer', {
          toReturn: ['id', 'flags'],
          scoreBy
        });
        const queryResult = await index.rest.data.query('offer', filter);
        expect(index.data.page(queryResult, filter).payload, `${scoreBy}`).to.deep.equal(result);
      }));
      expect(await index.rest.mapping.delete('offer')).to.equal(true);
    }).timeout(10000);
  });

  it('Testing Multi Version Query', async () => {
    const indexName = 'version-index-test';
    const meta = { mappings: { idx: { properties: { uuid: { type: 'keyword' } } } } };

    // initialization
    await index.rest.call('DELETE', `${indexName}@*`);
    const create1 = await index.rest.call('PUT', `${indexName}@1`, { body: meta });
    expect(create1.statusCode).to.equal(200);
    const create2 = await index.rest.call('PUT', `${indexName}@2`, { body: meta });
    expect(create2.statusCode).to.equal(200);

    // add data
    const uuid = uuid4();
    await index.rest.call('PUT', `${indexName}@2/idx/${uuid}`, { body: { uuid } });
    await index.rest.call('PUT', `${indexName}@1/idx/${uuid}`, { body: { uuid } });
    await index.rest.call('POST', `${indexName}@*`, { endpoint: '_refresh' });

    // run query
    const result = await index.rest.call('GET', `${indexName}@*`, { endpoint: '_search' });
    expect(result.body.hits.total).to.equal(2);

    // cleanup
    const delResult = await index.rest.call('DELETE', `${indexName}@*`);
    expect(delResult.statusCode).to.equal(200);
  });
});
