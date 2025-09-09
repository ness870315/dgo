/* eslint-disable */

/**
 * The raw data received when fetching the details of a tweet list.
 *
 * @public
 */
export interface IListDetailsResponse {
	data: Data;
}

interface Data {
	list: List;
}

interface List {
	created_at: number;
	default_banner_media: DefaultBannerMedia;
	default_banner_media_results: DefaultBannerMediaResults;
	description: string;
	following: boolean;
	id: string;
	id_str: string;
	is_member: boolean;
	member_count: number;
	mode: string;
	muting: boolean;
	name: string;
	subscriber_count: number;
	user_results: UserResults;
	facepile_urls: string[];
	followers_context: string;
	members_context: string;
}

interface DefaultBannerMedia {
	media_info: MediaInfo;
}

interface MediaInfo {
	original_img_url: string;
	original_img_width: number;
	original_img_height: number;
	salient_rect: SalientRect;
}

interface SalientRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface DefaultBannerMediaResults {
	result: Result;
}

interface Result {
	id: string;
	media_key: string;
	media_id: string;
	media_info: MediaInfo2;
	__typename: string;
}

interface MediaInfo2 {
	__typename: string;
	original_img_height: number;
	original_img_width: number;
	original_img_url: string;
	salient_rect: SalientRect2;
}

interface SalientRect2 {
	height: number;
	left: number;
	top: number;
	width: number;
}

interface UserResults {
	result: Result2;
}

interface Result2 {
	__typename: string;
	id: string;
	rest_id: string;
	affiliates_highlighted_label: AffiliatesHighlightedLabel;
	has_graduated_access: boolean;
	is_blue_verified: boolean;
	profile_image_shape: string;
	legacy: Legacy;
	verified_phone_status: boolean;
}

interface AffiliatesHighlightedLabel {}

interface Legacy {
	can_dm: boolean;
	can_media_tag: boolean;
	created_at: string;
	default_profile: boolean;
	default_profile_image: boolean;
	description: string;
	entities: Entities;
	fast_followers_count: number;
	favourites_count: number;
	followers_count: number;
	friends_count: number;
	has_custom_timelines: boolean;
	is_translator: boolean;
	listed_count: number;
	location: string;
	media_count: number;
	name: string;
	normal_followers_count: number;
	pinned_tweet_ids_str: any[];
	possibly_sensitive: boolean;
	profile_banner_url: string;
	profile_image_url_https: string;
	profile_interstitial_type: string;
	screen_name: string;
	statuses_count: number;
	translator_type: string;
	verified: boolean;
	want_retweets: boolean;
	withheld_in_countries: any[];
}

interface Entities {
	description: Description;
}

interface Description {
	urls: any[];
}
