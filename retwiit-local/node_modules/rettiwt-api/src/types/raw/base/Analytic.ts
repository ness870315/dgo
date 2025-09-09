/* eslint-disable */

/**
 * Represents the raw data of the analytic result of the User.
 *
 * @public
 */
export interface IAnalytics {
	__typename: string;
	organic_metrics_time_series: IAnalyticsMetric[];
	id: string;
}

export interface IAnalyticsMetric {
	metric_value: IAnalyticsMetricValue[];
	timestamp: IAnalyticsTimeStamp;
}

export interface IAnalyticsMetricValue {
	metric_value: number;
	metric_type: string;
}

export interface IAnalyticsTimeStamp {
	iso8601_time: string;
}
