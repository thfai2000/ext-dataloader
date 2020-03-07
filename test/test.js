const ExtendedDataLoader = require('./index.js')

// below are tests
const loader = new ExtendedDataLoader(batchLoadImpl)

async function batchLoadImpl(keys, fields) {
  console.log('batchLoad key:', keys)
  console.log('batchLoad fields:', fields)
  // return dummy data
  return keys.map(key => {
    return fields.reduce((acc, field)=>{
      acc[field] = `${key}'s${field}`
      return acc
    },{})
  })
}

(async ()=> {
  console.log('==== No cache ====')
  let a1 = loader.load(1, ['field1', 'field2'])
  let a2 = loader.load(2, ['field2', 'field3'])
  await a1 && await a2

  console.log('==== All hit cache ====')
  let b1 = loader.load(1, ['field2'])
  let b2 = loader.load(1, ['field3'])
  let b3 = loader.load(2, ['field1'])
  let b4 = loader.load(2, ['field2'])
  let b5 = loader.load(2)
  // value can be taken from cached if the requested fields are the part of the cached fields 
  await b1 && await b2 && await b3 && await b4 && await b5

  console.log('==== Some hit cache ====')
  let c1 = loader.load(1, ['field1', 'field4'])
  let c2 = loader.load(2, ['field1', 'field2', 'field3'])
  //value with key 2 can be taken from cached
  await c1 && await c2

  console.log('Different cache even with same key')
  let d1 = loader.load(2, ['field1'])
  let d2 = loader.load(2, ['field1', 'field4'])
  console.log('d1 is from cache? expected = true, actual =', (await d1) === (await c2))  // get from cache?
  console.log('d2 is from cache? expected = false, actual =', (await d2) === (await c2))  // get from cache?
})()