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
