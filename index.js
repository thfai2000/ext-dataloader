const DataLoader = require('dataloader');


// translation
// return {keys, fields}
function destructInfoArray(infoArray) {
  const uniqueKeys = new Set();
  const uniqueFields = new Set();
  infoArray.forEach((info) => {
    uniqueKeys.add(info.key);
    info.fields.forEach((field) => uniqueFields.add(field));
  });
  return { keys: [...uniqueKeys], fields: [...uniqueFields] };
}

// return true if all searchFields are found in targetFieldSet
function includesAllFields(targetFieldSet, searchFields) {
  const searchFieldsLen = searchFields.length;
  for (let i = 0; i < searchFieldsLen; i++) {
    if (!targetFieldSet.includes(searchFields[i])) {
      // console.debug('includesAllFields', targetFieldSet, searchFields, false)
      return false;
    }
  }
  // console.debug('includesAllFields', targetFieldSet, searchFields, true)
  return true;
}
class DataWithFieldsLoader extends DataLoader {
  // My terminology:
  // fieldSet = an array of fields  e.g. ['field1', 'field2', 'field3']
  // info = a object {key, fields} which fields is a fieldSet
  // e.g. {key: 'key1', fields:['field1', 'field2']}
  // into contains information of what fields are being selected from database

  constructor(batchLoadFn, options = {}) {
    const actualBatchLoadFn = async (infoArray) => {
      // clean up the batchField after process.nextTick()
      this.batchFieldSet = new Set();
      // spread infoArray into and de-duplicate some fields
      // make a array of fields with unique field names
      const { keys, fields } = destructInfoArray(infoArray);
      const result = await batchLoadFn(keys, fields);

      // record the latest fieldSet into fieldMap
      keys.forEach((key) => {
        let fieldSetArray = this.fieldMap.get(this.originalCacheKeyFn(key));
        if (!fieldSetArray) {
          fieldSetArray = [];
          this.fieldMap.set(this.originalCacheKeyFn(key), fieldSetArray);
        }
        // TODO: don't push the fieldSet if same exists
        fieldSetArray.push(fields);
      });
      return result;
    };

    const actualCacheKeyFn = (info) => {
      const resolvedKey = options.cacheKeyFn && options.cacheKeyFn(info.key);
      const key = `${resolvedKey || info.key}#${info.fields.join(',')}`;
      // console.debug(`resolved key: ${key}`)
      return key;
    };

    super(actualBatchLoadFn, {
      ...options,
      cacheKeyFn: actualCacheKeyFn,
    });
    // we need a map that record what fields a data value contains
    this.fieldMap = new Map();
    // we need a collect all fields that are being selected in one batch
    this.batchFieldSet = new Set();
    this.originalCacheKeyFn = options.cacheKeyFn || ((key) => key);
  }

  loadMany(keys, fields) {
    return keys.map((key) => this.load(key, fields));
  }

  async load(key, fields = []) {
    const set = new Set();
    // remove duplication of field names
    fields.forEach((field) => set.add(field));
    // the field names must be sorted
    // because the cacheKeyFn resolve the key by concate field names
    const info = { key, fields: [...set].sort() };

    const fieldSetArray = this.fieldMap.get(this.originalCacheKeyFn(info.key));
    // e.g. fieldSetArray = [ [field1, field3], [field1, field2], [field3, field4] ]
    // it is history of fields retrieval of object with that key
    // we have to find the first fieldSet that
    // fillful the basic requirement stated in the info object
    let foundFieldSet = null;
    if (fieldSetArray) {
      foundFieldSet = fieldSetArray.find((fs) => includesAllFields(fs, info.fields));
    }
    if (foundFieldSet) {
      // console.debug('request', info.fields, 'found...', foundFieldSet)
      return super.load({
        key,
        fields: foundFieldSet,
      });
    }

    info.fields.forEach((field) => this.batchFieldSet.add(field));
    // next Tick
    await new Promise((resolve) => {
      process.nextTick(() => {
        resolve();
      });
    });

    return super.load({
      key,
      fields: [...this.batchFieldSet],
    });
  }
}


module.exports = DataWithFieldsLoader;
