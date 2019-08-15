"use strict";
/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const bigquery = require("@google-cloud/bigquery");
const schema_1 = require("./schema");
const logs = require("../logs");
const bq = new bigquery.BigQuery();
class FirestoreBigQueryEventHistoryTracker {
    constructor() {
    }
    record(event) {
    }
}
exports.FirestoreBigQueryEventHistoryTracker = FirestoreBigQueryEventHistoryTracker;
/**
 * Ensure that the defined Firestore schema exists within BigQuery and
 * contains the correct information.
 *
 * This will check for the following:
 * 1) That the dataset exists
 * 2) That a `${tableName}_raw` data table exists to store how the data changes
 * over time
 * 3) That a `${tableName}` view exists to visualise the current state of the
 * data
 *
 * NOTE: This currently gets executed on every cold start of the function.
 * Ideally this would run once when the mod is installed if that were
 * possible in the future.
 */
exports.initializeSchema = (datasetId, tableName, schema, idFieldNames) => __awaiter(this, void 0, void 0, function* () {
    logs.bigQuerySchemaInitializing();
    const viewName = tableName;
    const realTableName = rawTableName(tableName);
    yield intialiseDataset(datasetId);
    yield initializeTable(datasetId, realTableName, schema.fields, idFieldNames);
    yield initializeView(datasetId, realTableName, viewName, schema, idFieldNames);
    logs.bigQuerySchemaInitialized();
});
exports.buildDataRow = (idFieldValues, insertId, operation, timestamp, data) => {
    return {
        data,
        id: idFieldValues,
        insertId,
        operation,
        timestamp,
    };
};
/**
 * Insert a row of data into the BigQuery `raw` data table
 */
exports.insertData = (datasetId, tableName, rows) => __awaiter(this, void 0, void 0, function* () {
    const realTableName = rawTableName(tableName);
    const dataset = bq.dataset(datasetId);
    const table = dataset.table(realTableName);
    const rowCount = Array.isArray(rows) ? rows.length : 1;
    logs.dataInserting(rowCount);
    yield table.insert(rows);
    logs.dataInserted(rowCount);
});
const rawTableName = (tableName) => `${tableName}_raw`;
/**
 * Check that the specified dataset exists, and create it if it doesn't.
 */
const intialiseDataset = (datasetId) => __awaiter(this, void 0, void 0, function* () {
    const dataset = bq.dataset(datasetId);
    const [datasetExists] = yield dataset.exists();
    if (datasetExists) {
        logs.bigQueryDatasetExists(datasetId);
    }
    else {
        logs.bigQueryDatasetCreating(datasetId);
        yield dataset.create();
        logs.bigQueryDatasetCreated(datasetId);
    }
    return dataset;
});
/**
 * Check that the table exists within the specified dataset, and create it
 * if it doesn't.  If the table does exist, validate that the BigQuery schema
 * is correct and add any missing fields.
 */
const initializeTable = (datasetId, tableName, fields, idFieldNames) => __awaiter(this, void 0, void 0, function* () {
    const dataset = bq.dataset(datasetId);
    let table = dataset.table(tableName);
    const [tableExists] = yield table.exists();
    if (tableExists) {
        table = yield schema_1.validateBQTable(table, fields, idFieldNames);
    }
    else {
        logs.bigQueryTableCreating(tableName);
        const options = {
            // `friendlyName` needs to be here to satisfy TypeScript
            friendlyName: tableName,
            schema: schema_1.firestoreToBQTable(fields, idFieldNames),
        };
        yield table.create(options);
        logs.bigQueryTableCreated(tableName);
    }
    return table;
});
/**
 * Check that the view exists within the specified dataset, and create it if
 * it doesn't.
 *
 * The view is created over the `raw` data table and extracts the latest state
 * of the underlying data, whilst excluding any rows that have been delete.
 *
 * By default, the document ID is used as the row ID, but can be overriden
 * using the `idField` property in the schema definition.
 */
const initializeView = (datasetId, tableName, viewName, schema, idFieldNames) => __awaiter(this, void 0, void 0, function* () {
    const dataset = bq.dataset(datasetId);
    let view = dataset.table(viewName);
    const [viewExists] = yield view.exists();
    if (viewExists) {
        view = yield schema_1.validateBQView(view, tableName, schema, idFieldNames);
    }
    else {
        logs.bigQueryViewCreating(viewName);
        const options = {
            // `friendlyName` needs to be here to satisfy TypeScript
            friendlyName: tableName,
            view: schema_1.firestoreToBQView(datasetId, tableName, schema, idFieldNames),
        };
        yield view.create(options);
        logs.bigQueryViewCreated(viewName);
    }
    return view;
});
