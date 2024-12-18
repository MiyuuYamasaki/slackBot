const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
// const { openModal } = require('./openModal');
const { updateMessage } = require('./updateMessage');

// 環境変数の設定
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// クライアントの初期化
const client = new WebClient(SLACK_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expressサーバーのセットアップ
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ボタンが押されたときの処理
app.post('/slack/actions', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload); // Slackのpayloadを解析

    //// デバッグ用 ： Payload内容確認時は下記コメントアウト外してください。
    // console.log('Payload:', JSON.stringify(payload, null, 2));

    if (payload.actions && payload.actions.length > 0) {
      // 必要情報を取得
      const action = payload.actions[0].action_id;
      const userId = payload.user?.name;
      const messageText = payload.message?.text;
      let modalView;

      if (action === 'button_add') {
        handleAddUser(payload, messageText);
      } else {
        // メインメッセージから日付を取得
        const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/);
        const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換
        const todaysDateString = getTodaysDate(); // 現在の日付を取得

        if (todaysDateString != ymd) {
          errorYmdMarch(payload, modalView);
          return;
        }

        try {
          if (action === 'button_list') {
            handleCreateList(payload, modalView, ymd).then(() => {
              res.status(200).send();
            });
          } else if (action === 'button_office' || action === 'button_remote') {
            handleWorkStyleChange(
              payload,
              action,
              messageText,
              userId,
              ymd
            ).then(() => {
              res.status(200).send();
            });
          } else if (action === 'button_goHome') {
            handleGoHome(payload, messageText, userId, ymd).then(() => {
              res.status(200).send();
            });
          }

          // res.status(200).send();
        } catch (e) {
          console.log(action + '時にエラーが発生しました：' + e);
          res.status(400).send();
        }
      }

      // User追加（スレッド）ボタン押下時
      // if (action === 'button_add') {
      //   console.log('▼ usersAdd action start');

      //   // メッセージから #タグ内のUserID を抽出
      //   const userIdMatch = messageText.match(/#([^#]+)#/);
      //   const extractedUserId = userIdMatch ? userIdMatch[1] : '';

      //   // ユーザー情報を入力させるモーダルウィンドウの構築と表示
      //   await client.views.open({
      //     trigger_id: payload.trigger_id,
      //     view: {
      //       type: 'modal',
      //       callback_id: 'add_user_modal',
      //       private_metadata: JSON.stringify({
      //         channel_id: payload.channel.id,
      //         message_ts: payload.container.message_ts,
      //       }),
      //       title: {
      //         type: 'plain_text',
      //         text: 'ユーザー情報を入力',
      //       },
      //       blocks: [
      //         {
      //           type: 'input',
      //           block_id: 'user_id_block',
      //           element: {
      //             type: 'plain_text_input',
      //             action_id: 'user_id_input',
      //             initial_value: extractedUserId, // 初期値
      //             placeholder: {
      //               type: 'plain_text',
      //               text: 'ユーザーIDを入力',
      //             },
      //           },
      //           label: {
      //             type: 'plain_text',
      //             text: 'ユーザーID',
      //           },
      //         },
      //         {
      //           type: 'input',
      //           block_id: 'user_name_block',
      //           element: {
      //             type: 'plain_text_input',
      //             action_id: 'user_name_input',
      //             placeholder: {
      //               type: 'plain_text',
      //               text: 'ユーザー名を入力 例：東京 太郎',
      //             },
      //           },
      //           label: {
      //             type: 'plain_text',
      //             text: 'ユーザー名',
      //           },
      //         },
      //       ],
      //       submit: {
      //         type: 'plain_text',
      //         text: '追加',
      //       },
      //     },
      //   });

      //   console.log('▲ usersAdd action end');
      //   res.status(200).send();
      // } else {
      //   // メインメッセージから日付を取得
      //   const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/);
      //   if (!ymdMatch) {
      //     console.error('Date not found in message text:', messageText);
      //     return;
      //   }

      //   const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換
      //   const todaysDateString = getTodaysDate(); // 現在の日付を取得

      //   // 当日データ以外は参照・変更を行わない。
      //   if (todaysDateString != ymd) {
      //     modalView = {
      //       type: 'modal',
      //       title: {
      //         type: 'plain_text',
      //         text: 'エラー 😢',
      //         emoji: true,
      //       },
      //       blocks: [
      //         {
      //           type: 'section',
      //           text: {
      //             type: 'mrkdwn',
      //             text: '当日データ以外の参照・変更はできません。',
      //           },
      //         },
      //       ],
      //     };

      //     // モーダルウィンドウを開く
      //     await client.views.open({
      //       trigger_id: payload.trigger_id,
      //       view: modalView,
      //     });
      //     res.status(200).send();
      //   } else {
      //     if (action === 'button_list') {
      //       // 一覧ボタンクリック時
      //       try {
      //         console.log('▼ createList action start');

      //         // クエリを実行してデータを取得
      //         const { data: records } = await supabase.rpc('custom_query');

      //         // データを分類
      //         const officeUsers =
      //           records
      //             .filter((record) => record.work_style === 'office')
      //             .map((record) => {
      //               // leaveCheckが奇数の場合に「退勤済」を追加
      //               return `<@${record.user_name}>${
      //                 record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
      //               }`;
      //             })
      //             .join('\n') || 'なし';

      //         const remoteUsers =
      //           records
      //             .filter((record) => record.work_style === 'remote')
      //             .map((record) => {
      //               return `<@${record.user_name}>${
      //                 record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
      //               }`;
      //             })
      //             .join('\n') || 'なし';

      //         const vacationUsers =
      //           records
      //             .filter((record) => record.work_style === '休暇')
      //             .map((record) => {
      //               return `<@${record.user_name}>${
      //                 record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
      //               }`;
      //             })
      //             .join('\n') || 'なし';

      //         // 一覧表示のモーダルウィンドウを作成
      //         modalView = {
      //           type: 'modal',
      //           callback_id: 'work_status_modal',
      //           title: {
      //             type: 'plain_text',
      //             text: `${ymd} 勤務状況一覧`,
      //           },
      //           blocks: [
      //             {
      //               type: 'section',
      //               text: {
      //                 type: 'mrkdwn',
      //                 text: `🏢 *本社勤務:*\n${officeUsers}`,
      //               },
      //             },
      //             {
      //               type: 'section',
      //               text: {
      //                 type: 'mrkdwn',
      //                 text: `🏠 *在宅勤務:*\n${remoteUsers}`,
      //               },
      //             },
      //             {
      //               type: 'section',
      //               text: {
      //                 type: 'mrkdwn',
      //                 text: `💤 *休暇(回答無):*\n${vacationUsers}`,
      //               },
      //             },
      //           ],
      //         };

      //         // モーダルウィンドウを開く
      //         await client.views.open({
      //           trigger_id: payload.trigger_id,
      //           view: modalView,
      //         });
      //         console.log('▲ createList action end');
      //         res.status(200).send();
      //       } catch (error) {
      //         console.log(action + '時にエラーが発生しました:' + error);
      //       }
      //     } else if (action === 'button_office' || action === 'button_remote') {
      //       // 本社勤務・在宅勤務ボタンクリック時
      //       try {
      //         console.log('▼ dateSet action start');

      //         // Userが存在するか確認
      //         const { data: userDate } = await supabase
      //           .from('Users')
      //           .select('*')
      //           .eq('code', userId)
      //           .single();

      //         // Userが存在しない場合、User追加を促すボタン付きスレッドメッセージを送信
      //         if (!userDate) {
      //           let responseText = `*#${userId}#* さんのデータが存在しません。追加しますか？`;

      //           await client.chat.postMessage({
      //             channel: payload.channel.id,
      //             thread_ts: payload.message.ts,
      //             text: responseText,
      //             blocks: [
      //               {
      //                 type: 'section',
      //                 text: {
      //                   type: 'mrkdwn',
      //                   text: responseText,
      //                 },
      //               },
      //               {
      //                 type: 'actions',
      //                 elements: [
      //                   {
      //                     type: 'button',
      //                     text: {
      //                       type: 'plain_text',
      //                       text: '追加',
      //                       emoji: true,
      //                     },
      //                     action_id: 'button_add',
      //                     style: 'primary',
      //                   },
      //                 ],
      //               },
      //             ],
      //           });
      //         }

      //         // 選択した勤務体系を取得
      //         let workStyle = action === 'button_office' ? 'office' : 'remote';

      //         // Record テーブルにデータを保存/更新
      //         const { data: existingRecord, error: fetchError } = await supabase
      //           .from('Record')
      //           .select('*')
      //           .eq('ymd', ymd)
      //           .eq('user_id', userId)
      //           .single();

      //         if (fetchError && fetchError.code !== 'PGRST116') {
      //           throw fetchError;
      //         }

      //         if (!existingRecord) {
      //           // レコードが存在しない場合はINSERT
      //           const { error: insertError } = await supabase
      //             .from('Record')
      //             .insert([
      //               {
      //                 ymd,
      //                 user_id: userId,
      //                 workStyle: workStyle,
      //                 leaveCheck: 0,
      //               },
      //             ]);

      //           if (insertError) throw insertError;
      //           console.log('Inserted new record for', userId);
      //         } else if (existingRecord.workStyle !== workStyle) {
      //           // workStyleが異なる場合はUPDATE
      //           const { error: updateError } = await supabase
      //             .from('Record')
      //             .update({ workStyle: workStyle })
      //             .eq('id', existingRecord.id);

      //           if (updateError) throw updateError;
      //           console.log('Updated record for', userId);
      //         }

      //         // 新規/未退勤の場合はメッセージ更新
      //         const { data: countDate } = await supabase.rpc('count_query');
      //         const officeCount =
      //           countDate.find((d) => d.workstyle === 'office')?.countstyle ||
      //           0;
      //         const remoteCount =
      //           countDate.find((d) => d.workstyle === 'remote')?.countstyle ||
      //           0;

      //         // 関数を呼び出す
      //         (async () => {
      //           const channel = payload.channel.id;
      //           const ts = payload.message.ts;
      //           const messageText = payload.message?.text;
      //           const options = {
      //             officeCount: officeCount,
      //             remoteCount: remoteCount,
      //             existingRecord: { workStyle: workStyle },
      //             leaveCheck: existingRecord.leaveCheck || 0,
      //           };

      //           try {
      //             await updateMessage(
      //               client,
      //               channel,
      //               ts,
      //               messageText,
      //               options
      //             );
      //           } catch (error) {
      //             console.error('Failed to update message:', error);
      //           }
      //         })();

      //         console.log('▲ dateSet action end');
      //         res.status(200).send();
      //       } catch (error) {
      //         console.log(action + '時にエラーが発生しました:' + error);
      //       }
      //     } else if (action === 'button_goHome') {
      //       // 退勤ボタンクリック時
      //       try {
      //         console.log('▼ goHome action start');

      //         // Recordテーブルのデータを取得
      //         const { data: existingRecord } = await supabase
      //           .from('Record')
      //           .select('*')
      //           .eq('ymd', ymd)
      //           .eq('user_id', userId)
      //           .single();

      //         // "count_query" の結果データから特定の workStyle のカウントを取得
      //         const { data: countDate } = await supabase.rpc('count_query');
      //         const officeCount =
      //           countDate.find((d) => d.workstyle === 'office')?.countstyle ||
      //           0;
      //         const remoteCount =
      //           countDate.find((d) => d.workstyle === 'remote')?.countstyle ||
      //           0;

      //         // 元の数値+1の数値で更新
      //         let leaveCheck = (existingRecord.leaveCheck || 0) + 1;

      //         // leaveCheck更新
      //         const { error: updateError } = await supabase
      //           .from('Record')
      //           .update({ leaveCheck: leaveCheck })
      //           .eq('id', existingRecord.id);

      //         if (updateError) throw updateError;

      //         console.log('Updated record for userId:', userId);

      //         // 関数を呼び出す
      //         (async () => {
      //           const channel = payload.channel.id;
      //           const ts = payload.message.ts;
      //           const messageText = payload.message?.text;
      //           const options = {
      //             officeCount: officeCount,
      //             remoteCount: remoteCount,
      //             existingRecord: { workStyle: existingRecord.workStyle },
      //             leaveCheck: leaveCheck,
      //           };

      //           try {
      //             await updateMessage(
      //               client,
      //               channel,
      //               ts,
      //               messageText,
      //               options
      //             );
      //           } catch (error) {
      //             console.error('Failed to update message:', error);
      //           }
      //         })();

      //         console.log('▲ goHome action end');
      //         res.status(200).send();
      //       } catch (error) {
      //         console.log(action + '時にエラーが発生しました:' + error);
      //       }
      //     }
      //   }
      // }
    } else {
      // コールバックアクション開始
      console.log('▼ callback action start');
      const callbackId = payload.view?.callback_id;

      if (callbackId === 'add_user_modal') {
        console.log('▼ add user action start');
        // モーダルから入力された値を取得
        const userId =
          payload.view.state.values.user_id_block.user_id_input.value;
        const userName =
          payload.view.state.values.user_name_block.user_name_input.value;

        if (!userId || !userName) {
          console.error('UserID or UserName is missing');
          return res.status(400).send('Invalid input');
        }

        const { data: users } = await supabase
          .from('Users')
          .select('*')
          .eq('code', userId)
          .single();

        if (!users) {
          // Supabaseにデータを追加
          const { error } = await supabase.from('Users').insert([
            {
              code: userId,
              name: userName,
            },
          ]);

          if (error) {
            console.error('Error adding user to Users table:', error);
            return res.status(500).send('Failed to add user');
          }

          message = `*${userName}* さんのデータを追加しました！`;

          console.log('User added successfully');
        } else {
          message = `*#${userId}#* さんのデータは既に存在しています。`;
        }

        // モーダルを開いた際に保存したチャンネル情報を取得
        const privateMetadata = JSON.parse(
          payload.view.private_metadata || '{}'
        );
        const channelId = privateMetadata.channel_id;
        const messageTs = privateMetadata.message_ts;

        if (!channelId || !messageTs) {
          console.error('Channel ID or Message TS is missing');
          return res.status(400).send('Channel or message reference missing');
        }

        //メッセージを更新
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: message,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message,
              },
            },
          ],
        });
      }
      console.log('▲ add user action end');
      console.log('▲ callback action end');
      res.status(200).send();
    }
  } catch (error) {
    console.error('Error handling action:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 当日日付取得用の関数
function getTodaysDate() {
  const now = new Date();

  // 日本時間に合わせる（UTC + 9 時間）
  now.setHours(now.getHours() + 9);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため、+1して0埋め
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ユーザー情報を追加
async function handleAddUser(payload, messageText) {
  console.log('▼ usersAdd action start');

  // メッセージから #タグ内のUserID を抽出
  const userIdMatch = messageText.match(/#([^#]+)#/);
  const extractedUserId = userIdMatch ? userIdMatch[1] : '';

  // ユーザー情報を入力させるモーダルウィンドウの構築と表示
  await client.views.open({
    trigger_id: payload.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'add_user_modal',
      private_metadata: JSON.stringify({
        channel_id: payload.channel.id,
        message_ts: payload.container.message_ts,
      }),
      title: {
        type: 'plain_text',
        text: 'ユーザー情報を入力',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'user_id_block',
          element: {
            type: 'plain_text_input',
            action_id: 'user_id_input',
            initial_value: extractedUserId, // 初期値
            placeholder: {
              type: 'plain_text',
              text: 'ユーザーIDを入力',
            },
          },
          label: {
            type: 'plain_text',
            text: 'ユーザーID',
          },
        },
        {
          type: 'input',
          block_id: 'user_name_block',
          element: {
            type: 'plain_text_input',
            action_id: 'user_name_input',
            placeholder: {
              type: 'plain_text',
              text: 'ユーザー名を入力 例：東京 太郎',
            },
          },
          label: {
            type: 'plain_text',
            text: 'ユーザー名',
          },
        },
      ],
      submit: {
        type: 'plain_text',
        text: '追加',
      },
    },
  });

  console.log('▲ usersAdd action end');
  // res.status(200).send();
}

// 画面日付と当日日付がアンマッチの場合
async function errorYmdMarch(payload, modalView) {
  modalView = {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: 'エラー 😢',
      emoji: true,
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '当日データ以外の参照・変更はできません。',
        },
      },
    ],
  };

  // モーダルウィンドウを開く
  await client.views.open({
    trigger_id: payload.trigger_id,
    view: modalView,
  });
  // res.status(200).send();
}

// 一覧ボタンクリック時
async function handleCreateList(payload, modalView, ymd) {
  console.log('▼ handleCreateList start');

  // クエリを実行してデータを取得
  const { data: records } = await supabase.rpc('custom_query');

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
        return `<@${record.user_name}>${
          record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
        }`;
      })
      .join('\n') || 'なし';

  const vacationUsers =
    records
      .filter((record) => record.work_style === '休暇')
      .map((record) => {
        return `<@${record.user_name}>${
          record.leave_check % 2 !== 0 ? ' (退勤済)' : ''
        }`;
      })
      .join('\n') || 'なし';

  // 一覧表示のモーダルウィンドウを作成
  modalView = {
    type: 'modal',
    callback_id: 'work_status_modal',
    title: {
      type: 'plain_text',
      text: `${ymd} 勤務状況一覧`,
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

  // モーダルウィンドウを開く
  await client.views.open({
    trigger_id: payload.trigger_id,
    view: modalView,
  });
  console.log('▲ handleCreateList end');
  // res.status(200).send();
}

// 本社・在宅ボタン処理

async function handleWorkStyleChange(payload, action, messageText, userId) {
  console.log('▼ handleWorkStyleChange start');

  const workStyle = action === 'button_office' ? 'office' : 'remote';

  // 既にデータが存在するか確認
  const { data: existingRecord, error } = await supabase.rpc('get_query', {
    userid: String(userId),
  });

  if (error) {
    console.error('Error executing RPC:', error);
    throw error;
  }
  console.log(userId + 'userId');

  // データが正しく取得できているか確認
  if (
    !existingRecord ||
    (Array.isArray(existingRecord) && existingRecord.length === 0)
  ) {
    console.log('No record found for userId:', userId);
  } else {
    console.log('Query result:', existingRecord);
  }

  if (
    !existingRecord ||
    (Array.isArray(existingRecord) && existingRecord.length === 0)
  ) {
    // レコードが存在しない場合はINSERT
    const { error: insertError } = await supabase.from('Record').insert([
      {
        ymd,
        user_id: userId,
        workStyle: workStyle,
        leaveCheck: 0,
      },
    ]);

    if (insertError) throw insertError;
    console.log('Inserted new record for', userId);
  } else if (existingRecord[0].work_style !== workStyle) {
    // workStyleが異なる場合はUPDATE
    const { error: updateError } = await supabase
      .from('Record')
      .update({ workStyle: workStyle })
      .eq('id', existingRecord[0].record_id);

    if (updateError) throw updateError;
    console.log('Updated record for', userId);
  }

  // DBから最新の人数を取得
  const { data: records } = await supabase.rpc('custom_query');
  const officeCount = records.filter((r) => r.work_style === 'office').length;
  const remoteCount = records.filter((r) => r.work_style === 'remote').length;

  // // 関数を呼び出す
  // const channel = payload.channel.id;
  // const ts = payload.message.ts;
  // const options = {
  //   officeCount: officeCount,
  //   remoteCount: remoteCount,
  //   existingRecord: { workStyle: workStyle },
  //   leaveCheck: existingRecord[0].leave_check || 0,
  // };

  // try {
  //   await updateMessage(client, channel, ts, messageText, options);
  // } catch (error) {
  //   console.error('Failed to update message:', error);
  // }

  // 関数を呼び出す
  (async () => {
    const channel = payload.channel.id;
    const ts = payload.message.ts;
    const messageText = payload.message?.text;
    const options = {
      officeCount: officeCount,
      remoteCount: remoteCount,
      existingRecord: { workStyle: workStyle },
      leaveCheck: existingRecord.leave_check || 0,
    };

    try {
      await updateMessage(client, channel, ts, messageText, options);
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  })();

  console.log('▲ handleWorkStyleChange end');
}

async function handleWorkStyleChange(payload, action, messageText, userId) {
  console.log('▼ handleWorkStyleChange start');

  // Userが存在するか確認
  // const { data: userDate } = await supabase
  //   .from('Users')
  //   .select('*')
  //   .eq('code', userId)
  //   .single();

  const workStyle = action === 'button_office' ? 'office' : 'remote';
  // await supabase.from('Record').upsert([{ ymd, user_id: userId, workStyle }]);
  // console.log(`WorkStyle updated for ${userId}: ${workStyle}`);

  // 既にデータが存在するか確認
  const { data: existingRecord, error } = await supabase.rpc('get_query', {
    userid: String(userId),
  });
  if (error) {
    console.error('Error executing RPC:', error);
    throw error;
  }
  console.log(userId + 'userId');

  // データが正しく取得できているか確認
  if (!existingRecord || existingRecord.length === 0) {
    console.log('No record found for userId:', userId);
  } else {
    console.log('Query result:', existingRecord);
  }

  if (!existingRecord.code) {
    infoUsers(payload, userId);
  } else {
    console.log('Hello.' + existingRecord.user_id);
  }

  if (!existingRecord || existingRecord.length === 0) {
    // レコードが存在しない場合はINSERT
    const { error: insertError } = await supabase.from('Record').insert([
      {
        ymd,
        user_id: userId,
        workStyle: workStyle,
        leaveCheck: 0,
      },
    ]);

    if (insertError) throw insertError;
    console.log('Inserted new record for', userId);
  } else if (existingRecord.work_style !== workStyle) {
    // workStyleが異なる場合はUPDATE
    const { error: updateError } = await supabase
      .from('Record')
      .update({ workStyle: workStyle })
      .eq('id', existingRecord.record_id);

    if (updateError) throw updateError;
    console.log('Updated record for', userId);
  }

  // DBから最新の人数を取得
  const { data: records } = await supabase.rpc('custom_query');
  const officeCount = records.filter((r) => r.work_style === 'office').length;
  const remoteCount = records.filter((r) => r.work_style === 'remote').length;
  console.log('officeCount:' + officeCount);
  console.log('remoteCount:' + remoteCount);
  // 関数を呼び出す
  (async () => {
    const channel = payload.channel.id;
    const ts = payload.message.ts;
    const messageText = payload.message?.text;
    const options = {
      officeCount: officeCount,
      remoteCount: remoteCount,
      existingRecord: { workStyle: workStyle },
      leaveCheck: existingRecord.leave_check || 0,
    };

    try {
      await updateMessage(client, channel, ts, messageText, options);
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  })();

  console.log('▲ handleWorkStyleChange end');
  // res.status(200).send();
}

async function infoUsers(payload, userId) {
  let responseText = `*#${userId}#* さんのデータが存在しません。追加しますか？`;

  await client.chat.postMessage({
    channel: payload.channel.id,
    thread_ts: payload.message.ts,
    text: responseText,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: responseText,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '追加',
              emoji: true,
            },
            action_id: 'button_add',
            style: 'primary',
          },
        ],
      },
    ],
  });
}

// 退勤ボタン処理
async function handleGoHome(payload, messageText, userId, ymd) {
  console.log('▼ handleGoHome start');

  // 退勤状態のトグル
  const { data: record } = await supabase
    .from('Record')
    .select('*')
    .eq('ymd', ymd)
    .eq('user_id', userId)
    .single();

  // const leaveCheck = record ? (record.leaveCheck + 1) % 2 : 1;
  let leave_check = (record.leaveCheck || 0) + 1;
  // await supabase
  //   .from('Record')aa
  //   .upsert([{ ymd, user_id: userId, leaveCheck: leaveCheck }]);

  //update
  const { error: updateError } = await supabase
    .from('Record')
    .update({ leaveCheck: leave_check })
    .eq('id', record.id);

  console.log(record);
  console.log('leaveCheck:' + leave_check);
  // DBから最新の人数を取得
  const { data: records } = await supabase.rpc('custom_query');
  const officeCount = records.filter((r) => r.work_style === 'office').length;
  const remoteCount = records.filter((r) => r.work_style === 'remote').length;
  console.log('officeCount:remoteCount' + officeCount + ':' + remoteCount);

  // Slackメッセージ更新
  // 関数を呼び出す
  (async () => {
    const channel = payload.channel.id;
    const ts = payload.message.ts;
    const messageText = payload.message?.text;
    const options = {
      officeCount: officeCount,
      remoteCount: remoteCount,
      existingRecord: { workStyle: record.workStyle },
      leaveCheck: leave_check,
    };

    try {
      await updateMessage(client, channel, ts, messageText, options);
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  })();

  console.log('▲ handleGoHome end');
  // res.status(200).send();

  // Recordテーブルのデータを取得
  // const { data: existingRecord } = await supabase
  //   .from('Record')
  //   .select('*')
  //   .eq('ymd', ymd)
  //   .eq('user_id', userId)
  //   .single();

  // "count_query" の結果データから特定の workStyle のカウントを取得
  // const { data: countDate } = await supabase.rpc('count_query');
  // const officeCount =
  //   countDate.find((d) => d.workstyle === 'office')?.countstyle ||
  //   0;
  // const remoteCount =
  //   countDate.find((d) => d.workstyle === 'remote')?.countstyle ||
  //   0;

  // 元の数値+1の数値で更新

  // leaveCheck更新
  // const { error: updateError } = await supabase
  //   .from('Record')
  //   .update({ leaveCheck: leaveCheck })
  //   .eq('id', existingRecord.id);

  // if (updateError) throw updateError;

  // console.log('Updated record for userId:', userId);
}

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
