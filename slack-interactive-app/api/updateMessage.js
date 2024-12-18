/**
 * Slackメッセージを更新する関数
 * @param {Object} client - Slack WebClientインスタンス
 * @param {string} channel - チャンネルID
 * @param {string} ts - メッセージのタイムスタンプ
 * @param {string} messageText - メッセージ本文
 * @param {Object} options - メッセージ更新用オプション
 * @param {number} options.officeCount - 本社勤務のカウント
 * @param {number} options.remoteCount - 在宅勤務のカウント
 * @param {Object} [options.existingRecord] - ユーザーの既存記録
 * @param {number} [options.leaveCheck] - 退勤のチェック状態
 * @returns {Promise<Object>} - Slack APIのレスポンス
 */
async function updateMessage(client, channel, ts, messageText, options) {
  const { officeCount, remoteCount } = options;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: messageText,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `🏢 本社勤務 (${officeCount})`,
            // text: '🏢 本社勤務 ',
            emoji: true,
          },
          action_id: 'button_office',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `🏠 在宅勤務 (${remoteCount})`,
            // text: '🏠 在宅勤務 ',
            emoji: true,
          },
          action_id: 'button_remote',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `📋 一覧`,
            emoji: true,
          },
          action_id: 'button_list',
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `👋 退勤`,
            emoji: true,
          },
          action_id: 'button_goHome',
          style: 'danger',
        },
      ],
    },
  ];

  try {
    const response = await client.chat.update({
      channel,
      ts,
      text: messageText,
      blocks,
    });
    return response;
  } catch (error) {
    console.error('Error updating message with buttons:', error);
    throw error;
  }
}

module.exports = { updateMessage };
