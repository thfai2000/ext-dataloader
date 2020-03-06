const DataLoader = require('dataloader')

class DataWithFieldsLoader extends DataLoader {

  // My terminology:
  // fieldSet = an array of fields  e.g. ['field1', 'field2', 'field3']
  // info = a object {key, fields} which fields is a fieldSet 
  // e.g. {key: 'key1', fields:['field1', 'field2']}
  // into contains information of what fields are being selected from database
  
  constructor(batchLoadFn, options = {}){
    let actualBatchLoadFn = async (infoArray) => {
      // clean up the batchField after process.nextTick()
      this.batchFieldSet = new Set()
      // spread infoArray into and de-duplicate some fields
      // make a array of fields with unique field names
      let {keys, fields} = destructInfoArray(infoArray)
      let result = await batchLoadFn(keys, fields)

      // record the latest fieldSet into fieldMap
      keys.forEach(key => {
        let fieldSetArray = this.fieldMap.get(this.originalCacheKeyFn(key) )
        if(!fieldSetArray){
          fieldSetArray = []
          this.fieldMap.set(this.originalCacheKeyFn(key), fieldSetArray)
        }
        // TODO: don't push the fieldSet if same exists
        fieldSetArray.push(fields)
      })
      return result
    }

    let resolvedKey = options.cacheKeyFn && options.cacheKeyFn(info.key)
    let actualCacheKeyFn = info => {
      let key = `${resolvedKey || info.key}#${info.fields.join(',')}`
      // console.debug(`resolved key: ${key}`)
      return key
    }

    super(actualBatchLoadFn, {
      ...options,
      cacheKeyFn: actualCacheKeyFn
    })
    // we need a map that record what fields a data value contains  
    this.fieldMap = new Map()
    // we need a collect all fields that are being selected in one batch
    this.batchFieldSet = new Set()
    this.originalCacheKeyFn = options.cacheKeyFn || (key => key) 
  }

  loadMany(keys, fields){
    return keys.map(key => this.load(key, fields))
  }

  async load(key, fields = []) {
    let set = new Set()
    // remove duplication of field names
    fields.forEach(field => set.add(field))
    // the field names must be sorted 
    // because the cacheKeyFn resolve the key by concate field names
    let info = {key, fields: [...set].sort()}

    let fieldSetArray = this.fieldMap.get(this.originalCacheKeyFn(info.key) )
    // e.g. fieldSetArray = [ [field1, field3], [field1, field2], [field3, field4] ]
    // it is history of fields retrieval of object with that key
    // we have to find the first fieldSet that 
    // fillful the basic requirement stated in the info object
    let foundFieldSet = null
    if(fieldSetArray){
      foundFieldSet = fieldSetArray.find(set => includesAllFields(set, info.fields) )
    }
    if(foundFieldSet){
      // console.debug('request', info.fields, 'found...', foundFieldSet)
      return await super.load({
        key,
        fields: foundFieldSet
      })
    } else {
  
      info.fields.forEach(field => this.batchFieldSet.add(field))
      // next Tick
      await new Promise( (resolve, reject) => {
        process.nextTick(() => {
          resolve()
        })
      })
      
      return await super.load({
        key,
        fields: [...this.batchFieldSet]
      })
    }
  }
}

// translation
// return [{key, fields}, {key, fields}]
function constructInfoArray(keys, fields) {
  return keys.map(key => ({key, fields}))
}

// translation
// return {keys, fields}
function destructInfoArray(infoArray) {
  let uniqueKeys = new Set()
  let uniqueFields = new Set()
  infoArray.forEach(info => {
    uniqueKeys.add(info.key)
    info.fields.forEach(field => uniqueFields.add(field))
  })
  return {keys: [...uniqueKeys], fields: [...uniqueFields]}
}

// return true if all searchFields are found in targetFieldSet
function includesAllFields(targetFieldSet, searchFields){
  const searchFieldsLen = searchFields.length
  for(let i=0; i<searchFieldsLen;i++) {
    if(!targetFieldSet.includes(searchFields[i])) {
      // console.debug('includesAllFields', targetFieldSet, searchFields, false)
      return false
    }
  }
  // console.debug('includesAllFields', targetFieldSet, searchFields, true)
  return true
}

module.exports = DataWithFieldsLoader
