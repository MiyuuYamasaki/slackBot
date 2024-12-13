/**
 * Slackでモーダルを表示する関数
 * @param {Object} client - Slack WebClientインスタンス
 * @param {string} triggerId - モーダルを開くためのtrigger_id
 * @param {string} modalTitle - モーダルのタイトル
 * @param {string} modalText - モーダルに表示するメッセージテキスト
 * @returns {Promise<Object>} - Slack APIのレスポンス
 */
async function openModal(client, triggerId, modalTitle, modalText) {
  const modalView = {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: modalTitle,
      emoji: true,
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: modalText,
        },
      },
    ],
  };

  try {
    const response = await client.views.open({
      trigger_id: triggerId,
      view: modalView,
    });
    return response;
  } catch (error) {
    console.error('Error opening modal:', error);
    throw error;
  }
}

module.exports = { openModal };

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
async function updateMessageWithButtons(
  client,
  channel,
  ts,
  messageText,
  options
) {
  const { officeCount, remoteCount, existingRecord, leaveCheck = 0 } = options;

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
            emoji: true,
          },
          action_id: 'button_office',
          style: existingRecord?.workStyle === 'office' ? 'primary' : undefined,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `🏠 在宅勤務 (${remoteCount})`,
            emoji: true,
          },
          action_id: 'button_remote',
          style: existingRecord?.workStyle === 'remote' ? 'primary' : undefined,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `📋 一覧`,
            emoji: true,
          },
          action_id: 'button_list',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: leaveCheck % 2 === 0 ? `👋 退勤` : `✅ 退勤済`,
            emoji: true,
          },
          action_id: 'button_goHome',
          style: leaveCheck % 2 === 0 ? undefined : 'danger',
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

module.exports = { updateMessageWithButtons };
