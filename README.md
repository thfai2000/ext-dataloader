# Extended Graphql Dataloader

DON'T USE IT. It is still in development

## Introduction
A extended version of Graphql Dataloader. It accept a new `batchLoadFn` that specifies the fields/attributes of data to be loaded. 

## what problem to be solved?
Graphql Dataloader currently can reduce the number of database access if many resolvers are requesting the same data.
But different resolvers may request some different attributes even they request the same data record (with same key).
To be benefited from `DataLoader`, the `batchLoadFn` has to retrieve data with all attributes. But that may result some unnecessary database access.

See More detail At:
https://github.com/graphql/dataloader/issues/236


# requirements
- Nodejs 8 or above
- with graphql/dataloader installed
```
npm install --save dataloader
```


# How to use

Some functions are overridden:

`load(key, fields)`
- `key`: A key value to load.
- `fields`: (optional) An array of field to load. Default value = []

`loadMany(keys, fields)`
- `keys`: An array of key values to load.
- `fields`: (optional) An array of field to load. Default value = []

`new DataLoader(batchLoadFn [, options])`
- `batchLoadFn`: function(keys, fields)
  - `keys`: an array of keys
  - `fields`: an array of field that are being queried. 

`load()` and `loadMany()` will return a cached value if both the `key` and `fields` matches those key and part of the fields in previous `batchLoadFn` calls.


## Example 1
```javascript
// assume that cached value is never expired. 

const loader = new DataLoader((keys, fields)=> {
  console.log('keys:', keys)
  console.log('fields:', fields)
  return batchLoadImpl(keys, fields)
})

(async ()=> {
  console.log('No cache')
  let a1 = loader.load(1, ['field1', 'field2'])
  let a2 = loader.load(2, ['field2', 'field3'])
  await a1 && await a2

  console.log('All hit cache')
  let b1 = loader.load(1, ['field2'])
  let b2 = loader.load(1, ['field3'])
  let b3 = loader.load(2, ['field1'])
  let b4 = loader.load(2, ['field2'])
  let b5 = loader.load(2)
  // value can be taken from cached if the requested fields are the part of the cached fields 
  await b1 && await b2 && await b3 && await b4 && await b5

  console.log('Some hit cache')
  let c1 = loader.load(1, ['field1', 'field4'])
  let c2 = loader.load(2, ['field1', 'field2', 'field3'])
  //value with key 2 can be taken from cached
  await c1 && await c2

  console.log('Different cache even with same key')
  let d1 = loader.load(2, ['field1'])
  let d2 = loader.load(2, ['field1', 'field4'])
  console.log('d1 is from cache?', (await d1) === (await c2))  // get from cache?
  console.log('d2 is from cache?', (await d2) === (await c2))  // get from cache?
})()
```
Expected console outputs:
```
No cache
keys: [1, 2]
fields: ['field1', 'field2', 'field3']
All hit cache
Some hit cache
keys: [1]        
fields: ['field1', 'field4']
Different cache even with same key
keys: [2]
fields: ['field1, 'field4']
d1 is from cache? true
d2 is from cache? false
```

## Example 2: Use in graphql resolvers
```javascript
// native sql approach
const carLoader = new DataLoader( (keys, fields) => {
  let subqueries = []

  if(fields.includes('latestOwner')){
    subqueries.push(`(SELECT owner FROM car_trade_records trade 
      WHERE trade.cardId = car.id ORDER BY logDatetime DESC LIMIT 1) AS lastOwner`)
  }

  if(fields.includes('lastAccidentLocation')){
    subqueries.push(`(SELECT location FROM car_accident_records acc 
      WHERE acc.carId = car.id ORDER BY logDatetime DESC LIMIT 1) AS lastAccidentLocation`)
  }
	
  return await mysql.query(`SELECT *, ${subqueries.join(',')} FROM car WHERE id IN ?`, keys)
	
})

let resolvers = {
  Car :{
    latestOwner: async (car, args, context, info) => {
      // info.fieldName: 'latestOwner'
      let carRecord = await carLoader.load(car.id, [info.fieldName])	
      return carRecord.lastOwner
    },
    lastAccidentLocation: async (car, args, context, info) => {
      // info.fieldName: 'lastAccidentLocation'
      let carRecord = await carLoader.load(car.id, [info.fieldName])
      return carRecord.lastAccidentLocation
    }
  },
  Query: {
    cars: async (car, args, context, info) => {
      //determine the necessary fields of the Car Entity in graphql query
      let involvedFields = info.fieldNodes.map(node => node.name.value)
      return await carLoader.loadMany(args.ids, involvedFields)
    }
  }
}
```

