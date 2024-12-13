const { WebClient } = require('@slack/web-api');

// Slackのトークンを環境変数から取得
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CHANNEL_ID = 'C083QUBKU9L'; // 送信先のチャンネルID

// 日付のフォーマットを変更
function getFormattedDate() {
  // タイムゾーンを日本時間（UTC+9）に固定
  const today = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }) // export
  );
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため、+1して0埋め
  const day = String(today.getDate()).padStart(2, '0');

  // 曜日を取得（日本語）
  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = daysOfWeek[now.getDay()];

  return `${year}/${month}/${day}(${dayOfWeek})`; // 例: 2024/12/05(木)
}

// Slack Web APIクライアントを初期化
const client = new WebClient(SLACK_TOKEN);

// ボタン付きメッセージ
async function sendInteractiveMessage() {
  try {
    const formattedDate = getFormattedDate(); // 当日の日付を取得
    const result = await client.chat.postMessage({
      channel: CHANNEL_ID,
      text: `業務連絡スレッド ${formattedDate}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `業務連絡スレッド ${formattedDate}`,
          },
        },
        {
          type: 'actions', // ボタンを含むブロック
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🏢 本社勤務',
                emoji: true,
              },
              action_id: 'button_office', // ボタンの識別子
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🏠 在宅勤務',
                emoji: true,
              },
              action_id: 'button_remote', // ボタンの識別子
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
          ],
        },
      ],
    });
    console.log('Message sent: ', result.ts);
  } catch (error) {
    console.error('Error sending message: ', error);
  }
}

sendInteractiveMessage(); // ボタン付きメッセージ送信
