/**
 * Options specifying the data that is to be posted.
 *
 * @public
 */
export interface IPostArgs {
	/**
	 * The id of the target resource.
	 *
	 * @remarks
	 * Required only when posting using the following resources:
	 * - {@link EResourceType.TWEET_LIKE}
	 * - {@link EResourceType.TWEET_RETWEET}
	 * - {@link EResourceType.TWEET_UNLIKE}
	 * - {@link EResourceType.TWEET_UNPOST}
	 * - {@link EResourceType.TWEET_UNRETWEET}
	 * - {@link EResourceType.USER_FOLLOW}
	 * - {@link EResourceType.USER_UNFOLLOW}
	 */
	id?: string;

	/**
	 * The tweet that is to be posted.
	 *
	 * @remarks
	 * Required only when posting a tweet using {@link EResourceType.TWEET_POST}
	 */
	tweet?: INewTweet;

	/**
	 * The media file to be uploaded.
	 *
	 * @remarks
	 * Required only when uploading a media using the following resources:
	 * - {@link EResourceType.MEDIA_UPLOAD_APPEND}
	 * - {@link EResourceType.MEDIA_UPLOAD_FINALIZE}
	 * - {@link EResourceType.MEDIA_UPLOAD_INITIALIZE}
	 */
	upload?: IUploadArgs;
}

/**
 * Configuration for the new tweet to be posted.
 *
 * @public
 */
export interface INewTweet {
	/**
	 * The list of media to be uploaded.
	 *
	 * @remarks
	 * - The media first needs to be uploaded.
	 * - After uploading, the returned id(s) can be used to reference the media here.
	 * - Maximum number of media items that can be posted is 4.
	 */
	media?: INewTweetMedia[];

	/** The id of the tweet to quote. */
	quote?: string;

	/** The id of the Tweet to which the given Tweet must be a reply. */
	replyTo?: string;

	/** The date/time at which the tweet is to be scheduled for posting. */
	scheduleFor?: Date;

	/**
	 * The text for the tweet to be created.
	 *
	 * @remarks
	 * Length of the tweet must be \<= 280 characters.
	 */
	text?: string;
}

/**
 * Configuration for the media to be uploaded.
 *
 * @public
 */
export interface INewTweetMedia {
	/** The id of the media to upload. */
	id: string;

	/**
	 * The list of id of the users to tag in the media.
	 *
	 * @remarks
	 * Maximum number of users that can be tagged is 10.
	 */
	tags?: string[];
}

/**
 * Options specifying the media file to be uploaded.
 *
 * @public
 */
export interface IUploadArgs {
	/** The id allocated to the media file to be uploaded. */
	id?: string;

	/** The media file to be uploaded. */
	media?: string | ArrayBuffer;

	/**
	 * The size (in bytes) of the media file to be uploaded.
	 *
	 * @remarks The size must be \<= 5242880 bytes.
	 */
	size?: number;
}
