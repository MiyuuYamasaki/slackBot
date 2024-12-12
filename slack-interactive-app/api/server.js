const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// 環境変数の設定
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // anon key

// クライアントの初期化
const client = new WebClient(SLACK_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // anon keyを使用

// Expressサーバーのセットアップ
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

function getTodaysDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため、+1して0埋め
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ボタンが押されたときの処理
app.post('/slack/actions', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload); // Slackのpayloadを解析
    const action = payload.actions[0].action_id;
    const userId = payload.user?.name;

    // ボタンが押されたメッセージのtextを取得
    const messageText = payload.message.text;
    const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/);

    if (!ymdMatch) {
      throw new Error('Date not found in the message text');
    }

    const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換

    // 当日日付を取得
    const todaysDateString = getTodaysDate();
    console.log(todaysDateString); // 例: 2024-12-10

    if (action === 'button_list') {
      console.log('▼ createList action start');

      const modalView = {};

      if (!todaysDateString != ymd) {
        // クエリを実行してデータを取得
        const { data: records, error: queryError } = await supabase.rpc(
          'custom_query',
          {
            ymd_param: ymd, // SQLに渡す日付パラメータ
          }
        );

        if (queryError) {
          console.error('Error fetching records:', queryError);
          throw queryError;
        }

        // データを分類
        const officeUsers =
          records
            .filter((record) => record.work_style === 'office')
            .map((record) => {
              // leaveCheckが奇数の場合に「退勤済」を追加
              return `<@${record.user_name}>${
                record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
              }`;
            })
            .join('\n') || 'なし';

        const remoteUsers =
          records
            .filter((record) => record.work_style === 'remote')
            .map((record) => {
              // leaveCheckが奇数の場合に「退勤済」を追加
              return `<@${record.user_name}>${
                record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
              }`;
            })
            .join('\n') || 'なし';

        const vacationUsers =
          records
            .filter((record) => record.work_style === '休暇')
            .map((record) => {
              // leaveCheckが奇数の場合に「退勤済」を追加
              return `<@${record.user_name}>${
                record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
              }`;
            })
            .join('\n') || 'なし';

        // モーダルビューの構築
        modalView = {
          type: 'modal',
          callback_id: 'work_status_modal',
          title: {
            type: 'plain_text',
            text: `${ymd} 勤務状況一覧`,
          },
          close: {
            type: 'plain_text',
            text: '閉じる',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🏢 *本社勤務:*\n${officeUsers}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🏠 *在宅勤務:*\n${remoteUsers}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `💤 *休暇(回答無):*\n${vacationUsers}`,
              },
            },
          ],
        };
      } else {
        modalView = {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'お知らせ',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '当日データ以外参照できません。',
              },
            },
          ],
          submit: {
            type: 'plain_text',
            text: 'OK',
          },
        };
      }

      // モーダルウィンドウを開く
      await client.views.open({
        trigger_id: payload.trigger_id,
        view: modalView,
      });
      console.log('▲ createList action end');
    }

    if (action === 'button_office' || action === 'button_remote') {
      console.log('▼ dateSet action start');
      let workStyle = null;
      if (action === 'button_office') workStyle = 'office';
      if (action === 'button_remote') workStyle = 'remote';

      // Supabaseにデータを保存/更新
      const { data: existingRecord, error: fetchError } = await supabase
        .from('Record')
        .select('*')
        .eq('ymd', ymd)
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // 退勤済みの場合処理を行わない。
      if (existingRecord.leaveCheck % 2 === 0) {
        if (!existingRecord) {
          // レコードが存在しない場合はINSERT
          const { error: insertError } = await supabase
            .from('Record')
            .insert([{ ymd, user_id: userId, workStyle: workStyle }]);

          if (insertError) throw insertError;
          console.log('Inserted new record for', userId);
        } else {
          // 既存のレコードがあり、workStyleが異なる場合はUPDATE
          if (existingRecord.workStyle !== workStyle) {
            const { error: updateError } = await supabase
              .from('Record')
              .update({ workStyle: workStyle })
              .eq('id', existingRecord.id);

            if (updateError) throw updateError;
            console.log('Updated record for', userId);
          } else {
            // 同じworkStyleの場合は変更なし
            console.log('No change needed, already selected', workStyle);
          }
        }

        // クエリを実行してデータを取得
        const { data: records, error: queryError } = await supabase.rpc(
          'custom_query',
          {
            ymd_param: ymd, // SQLに渡す日付パラメータ
          }
        );

        if (queryError) {
          console.error('Error fetching records:', queryError);
          throw queryError;
        }

        // 各勤務場所の人数を集計
        const officeCount = records.filter(
          (record) => record.work_style === 'office'
        ).length;
        const remoteCount = records.filter(
          (record) => record.work_style === 'remote'
        ).length;

        console.log('officeCount:', officeCount);
        console.log('remoteCount:', remoteCount);

        // メッセージを更新
        await client.chat.update({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: messageText, // 元のメッセージを保持
          blocks: [
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
                  style: workStyle === 'office' ? 'primary' : undefined,
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: `🏠 在宅勤務 (${remoteCount})`,
                    emoji: true,
                  },
                  action_id: 'button_remote',
                  style: workStyle === 'remote' ? 'primary' : undefined,
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
                    text: `👋 退勤`,
                    emoji: true,
                  },
                  action_id: 'button_goHome',
                },
              ],
            },
          ],
        });
      }
      console.log('▲ dateSet action end');
    }

    if (action === 'button_goHome') {
      console.log('▼ goHome action start');

      // Supabaseにデータを保存/更新
      const { data: existingRecord, error: fetchError } = await supabase
        .from('Record')
        .select('*')
        .eq('ymd', ymd)
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        console.log('No existing record. No update necessary.');
        return;
      } else if (fetchError) {
        throw fetchError;
      }

      let leaveCheck = (existingRecord.leaveCheck || 0) + 1;

      // クエリを実行してデータを取得
      const { data: records, error: queryError } = await supabase.rpc(
        'custom_query',
        {
          ymd_param: ymd, // SQLに渡す日付パラメータ
        }
      );

      if (queryError) {
        console.error('Error fetching records:', queryError);
        throw queryError;
      }

      // 各勤務場所の人数を集計
      const officeCount = records.filter(
        (record) => record.work_style === 'office'
      ).length;
      const remoteCount = records.filter(
        (record) => record.work_style === 'remote'
      ).length;

      // leaveCheck更新
      const { error: updateError } = await supabase
        .from('Record')
        .update({ leaveCheck: leaveCheck })
        .eq('id', existingRecord.id);

      if (updateError) throw updateError;

      console.log('Updated record for userId:', userId);

      await client.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        text: messageText, // 通常のテキスト
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn', // `mrkdwn` を使用してテキストをマークダウン形式にする
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
                style:
                  existingRecord && existingRecord.workStyle === 'office'
                    ? 'primary'
                    : undefined,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: `🏠 在宅勤務 (${remoteCount})`,
                  emoji: true,
                },
                action_id: 'button_remote',
                style:
                  existingRecord && existingRecord.workStyle === 'remote'
                    ? 'primary'
                    : undefined,
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
        ],
      });
      console.log('▲ goHome action end');
    }

    res.status(200).send();
  } catch (error) {
    console.error('Error handling action:', error);
    res.status(500).send('Internal Server Error');
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
