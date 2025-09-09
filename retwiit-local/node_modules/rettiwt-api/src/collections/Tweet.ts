import { RawTweetRepliesSortType } from '../enums/raw/Tweet';
import { TweetRepliesSortType } from '../enums/Tweet';

/**
 * Collection of mapping from parsed reply sort type to raw reply sort type.
 *
 * @internal
 */
export const TweetRepliesSortTypeMap: { [key in keyof typeof TweetRepliesSortType]: RawTweetRepliesSortType } = {
	/* eslint-disable @typescript-eslint/naming-convention */

	LATEST: RawTweetRepliesSortType.LATEST,
	LIKES: RawTweetRepliesSortType.LIKES,
	RELEVANCE: RawTweetRepliesSortType.RELEVACE,

	/* eslint-enable @typescript-eslint/naming-convention */
};
