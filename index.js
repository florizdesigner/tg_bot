const TelegramBot = require("node-telegram-bot-api")
const axios = require("axios")
const {v4} = require('uuid')
const express = require('express')
const router = require('router')
const mongoose = require("mongoose")

const yookassa = require('./yookassa_data.json')
const config = require('./config/default.json')


///////////////////////////////////////////////////

const TOKEN = "5926753819:AAG62DqKBs-O0HP1ycgUBP83HVQT7nB1UTk"

const bot = new TelegramBot(TOKEN, {
    polling: true
})

const {port, db_url} = config


const app = express();

app.use(express.json());
app.use("/api", router);


//////////////////////////////////////////////////////////////////
// запуск сервера
mongoose.set('strictQuery', false);


async function startApp() {
    try {
        await mongoose.connect(db_url);
        app.listen(port, () =>
            console.log("hello! server started on port " + port)
        );
    } catch (e) {
        console.log(e);
    }
}

startApp();

//////////////////////////////////////////////////////////////////

app.get("/", (req, res) => {
    res.status(200).json("Сервер работает");
});

app.post('/yookassa', (req, res) => {
    bot.processUpdate(req.body)
    console.log(req.body)
    // здесь проверяем, совпадает ли shopid с нашим. если да, то отлично и отдаем 200. если нет - 404
    if (req.body.object.recipient.account_id === yookassa.auth.test.shopid) {
        console.log('notification success')
        res.status(200).json({status: "success"})
    } else {
        console.log('delivery notification unsuccessful')
        res.status(404).json({status: "error", description: "account_id is invalid"})
    }
})

/////////////////////////////////////////////////////////////////////////


// bot.getUpdates()
// bot.setWebHook(`${config.get('url')}/yookassa`)

bot.onText(/\/help (.+)/, (msg, [source, match]) => {
    const {id} = msg.chat
    bot.sendMessage(id, 'Клавиатура', {
        reply_markup: {
            keyboard: [
                [{
                    text: "Отправить местоположение",
                    request_location: true
                }],
                ['Ответить', 'Закрыть'],
                [{
                    text: "Отправить контакт",
                    request_contact: true
                }]
            ]
        }
    })
})

bot.on('message', (msg => {
    switch (msg.text) {
        case 'Ответить':
            bot.sendMessage(msg.chat.id, "Отвечаю", {
                reply_markup: {
                    force_reply: true
                }
            })
            break;
        case "Закрыть":
            bot.sendMessage(msg.chat.id, "Закрываю клавиатуру", {
                reply_markup: {
                    remove_keyboard: true
                }
            })
            break;
    }
}))

bot.on('message', msg => {
    console.log(msg)
})

bot.onText(/\/pay/, msg => {
    bot.sendMessage(msg.chat.id, `message: ${v4()}`)
    const paymentData = {

        "confirmation": {
            "type": "redirect",
            "return_url": "https://t.me/my_testing_api_bot"
        },
        "payment_method_data": {
            "type": "bank_card"
        },
        "amount": {
            "value": "1.00",
            "currency": "RUB"
        },
        "capture": true,
        "description": "Заказ №72",
        "receipt": {
            "customer": {
                "full_name": "Jo",
                "phone": "79001231122"
            },
            "items": [
                {
                    "description": "Товар",
                    "quantity": "1",
                    "amount": {
                        "value": "1.00",
                        "currency": "RUB"
                    },
                    "vat_code": "2",
                    "payment_mode": "full_prepayment",
                    "payment_subject": "commodity"
                }
            ]
        }
    }

    axios.post(yookassa.paymentsURL, paymentData, {
        auth: {
            username: yookassa.auth.test.shopid,
            password: yookassa.auth.test.secretKey
        },
        headers: {
            "Content-Type": "application/json",
            "Idempotence-Key": v4()
        }
    })
        .then(function (response) {
            const data = response.data;
            // window.location.href(data.confirmation.confirmation_data)
            console.log(data)
            // bot.sendMessage(msg.chat.id, `Ссылка на оплату: ${data.confirmation.confirmation_url}`)
            // bot.setWebHook()
            bot.sendMessage(msg.chat.id, 'Перейдите на страницу оплаты. После оплаты нажмите на "Проверить".', {
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: "Оплатить",
                            url: data.confirmation.confirmation_url
                        }],
                        [{
                            text: "Проверить",
                            callback_data: data.id
                        }]
                    ]
                }
            })
        })
        .catch(function (error) {
            console.log(error);
        });
})

bot.on('callback_query', query => {
    if (query.data.length === 36) {
        axios.get(`${yookassa.paymentsURL}/${query.data}`, {
            auth: {
                username: yookassa.auth.test.shopid,
                password: yookassa.auth.test.secretKey
            }
        })
            .then(response => {
                console.log(response.data)
                const getMessage = () => {
                    switch (response.data.status) {
                        case "succeeded":
                            return "Оплата прошла успешно, сейчас вылетит птичка.."
                        case "waiting_for_capture":
                            return `Оплата прошла успешно, напишите в службу поддержки. Идентификатор платежа: ${response.data.id}`
                        case "pending":
                            return "Вы еще не оплатили этот заказ.."
                        case "canceled":
                            return "Операция неуспешна, введите команду /pay и оплатите заново."
                        default:
                            return `Что-то пошло не так, напишите в службу поддержки. Идентификатор платежа: ${response.data.id}`
                    }
                }
                bot.sendMessage(query.message.chat.id, getMessage())
            })
            .catch(e => console.log(e))
    }
})