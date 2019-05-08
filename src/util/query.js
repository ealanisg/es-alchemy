const assert = require('assert');
const get = require('lodash.get');
const isEqual = require('lodash.isequal');
const objectFields = require('object-fields');
const actionMap = require('../resources/action-map');
const { fromCursor } = require('../util/paging');
const { buildQuery } = require('./filter');

module.exports.build = (allowedFields, {
  toReturn = [''],
  filterBy = [],
  orderBy = [],
  scoreBy = [],
  limit,
  offset,
  cursor
}) => {
  assert(cursor === undefined || offset === undefined, 'Cannot override offset with cursor.');
  const cursorPayload = cursor !== undefined ? fromCursor(cursor) : null;
  const { size, from } = {
    size: typeof limit === 'number' ? limit : get(cursorPayload, 'limit', 20),
    from: typeof offset === 'number' ? offset : get(cursorPayload, 'offset', 0)
  };
  const result = {
    _source: typeof toReturn === 'string' ? objectFields.split(toReturn) : toReturn,
    size,
    from
  };
  // eslint-disable-next-line no-underscore-dangle
  assert(Array.isArray(result._source), 'Invalid toReturn provided.');
  assert(
    // eslint-disable-next-line no-underscore-dangle
    allowedFields === null || isEqual(toReturn, ['']) || result._source.every(f => allowedFields.includes(f)),
    'Invalid field(s) provided.'
  );
  if (filterBy.length !== 0) {
    result.query = buildQuery(filterBy, allowedFields)[1];
  }
  if (scoreBy.length !== 0) {
    result.query = {
      function_score: {
        query: get(result, 'query', { match_all: {} }),
        functions: scoreBy.map(e => actionMap.score[e[0]](...e.slice(1))),
        score_mode: 'sum',
        boost_mode: 'replace'
      }
    };
  }
  result.sort = [
    ...orderBy,
    ...(scoreBy.length !== 0 ? [['_score', 'desc', null]] : []),
    ...(get(orderBy.slice(-1), '[0][0]') === 'id' && ['asc', 'desc'].includes(get(orderBy.slice(-1), '[0][1]'))
      ? []
      : [['id', 'asc']])
  ]
    .map(e => actionMap.order[e[1]](e[0], ...e.slice(2)));
  return result;
};
