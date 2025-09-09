/* eslint-disable */

/**
 * The raw data received when fetching the analytic overview of the user.
 *
 * @public
 */
export interface IUserAnalyticsResponse {
	data: Data;
}

interface Data {
	result: Result;
}

interface Result {
	result: Result2;
	id: string;
}

interface Result2 {
	__typename: string;
	organic_metrics_time_series: Series[];
	id: string;
}

interface Series {
	metric_values: MetricValue[];
	timestamp: Timestamp;
}

interface MetricValue {
	metric_value: number;
	metric_type: string;
}

interface Timestamp {
	iso8601_time: string;
}
