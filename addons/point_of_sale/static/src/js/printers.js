/* global html2canvas */
odoo.define('point_of_sale.Printer', function (require) {
    "use strict";

    var Session = require('web.Session');
    var core = require('web.core');
    const {Gui} = require('point_of_sale.Gui');
    var _t = core._t;

// IMPROVEMENT: This is too much. We can get away from this class.
    class PrintResult {
        constructor({successful, message}) {
            this.successful = successful;
            this.message = message;
        }
    }

    class PrintResultGenerator {
        IoTActionError() {
            return new PrintResult({
                successful: false,
                message: {
                    title: _t('Connection to IoT Box failed'),
                    body: _t('Please check if the IoT Box is still connected.'),
                },
            });
        }

        IoTResultError() {
            return new PrintResult({
                successful: false,
                message: {
                    title: _t('Connection to the printer failed'),
                    body: _t('Please check if the printer is still connected.'),
                },
            });
        }

        Successful() {
            return new PrintResult({
                successful: true,
            });
        }
    }

    var PrinterMixin = {
        init: function (pos) {
            this.receipt_queue = [];
            this.printResultGenerator = new PrintResultGenerator();
            this.pos = pos;
        },

        /**
         * Add the receipt to the queue of receipts to be printed and process it.
         * We clear the print queue if printing is not successful.
         * @param {String} receipt: The receipt to be printed, in HTML
         * @returns {PrintResult}
         */
        print_receipt: async function (receipt) {
            if (receipt) {
                this.receipt_queue.push(receipt);
            }
            let image, sendPrintResult;
            while (this.receipt_queue.length > 0) {
                receipt = this.receipt_queue.shift();
                image = await this.htmlToImg(receipt);
                try {
                    sendPrintResult = await this.send_printing_job(image);
                } catch (error) {
                    // Error in communicating to the IoT box.
                    this.receipt_queue.length = 0;
                    return this.printResultGenerator.IoTActionError();
                }
                // rpc call is okay but printing failed because
                // IoT box can't find a printer.
                if (!sendPrintResult || sendPrintResult.result === false) {
                    this.receipt_queue.length = 0;
                    return this.printResultGenerator.IoTResultError();
                }
            }
            return this.printResultGenerator.Successful();
        },

        /**
         * Generate a jpeg image from a canvas
         * @param {DOMElement} canvas
         */
        process_canvas: function (canvas) {
            return canvas.toDataURL('image/jpeg').replace('data:image/jpeg;base64,', '');
        },

        /**
         * Renders the html as an image to print it
         * @param {String} receipt: The receipt to be printed, in HTML
         */
        htmlToImg: function (receipt) {
            var self = this;
            $('.pos-receipt-print').html(receipt);
            var promise = new Promise(function (resolve, reject) {
                self.receipt = $('.pos-receipt-print>.pos-receipt');
                html2canvas(self.receipt[0], {
                    onparsed: function (queue) {
                        queue.stack.ctx.height = Math.ceil(self.receipt.outerHeight() + self.receipt.offset().top);
                        queue.stack.ctx.width = Math.ceil(self.receipt.outerWidth() + 2 * self.receipt.offset().left);
                    },
                    onrendered: function (canvas) {
                        $('.pos-receipt-print').empty();
                        resolve(self.process_canvas(canvas));
                    },
                    letterRendering: self.pos.htmlToImgLetterRendering(),
                })
            });
            return promise;
        },

        _onIoTActionResult: function (data) {
            if (this.pos && (data === false || data.result === false)) {
                Gui.showPopup('ErrorPopup', {
                    'title': _t('Connection to the printer failed'),
                    'body': _t('Please check if the printer is still connected.'),
                });
            }
        },

        _onIoTActionFail: function () {
            if (this.pos) {
                Gui.showPopup('ErrorPopup', {
                    'title': _t('Connection to IoT Box failed'),
                    'body': _t('Please check if the IoT Box is still connected.'),
                });
            }
        },
    }

    var Printer = core.Class.extend(PrinterMixin, {
        init: function (url, pos) {
            PrinterMixin.init.call(this, pos);
            this.connection = new Session(undefined, url || 'http://localhost:8069', {use_cors: true});
        },

        /**
         * Sends a command to the connected proxy to open the cashbox
         * (the physical box where you store the cash). Updates the status of
         * the printer with the answer from the proxy.
         */
        open_cashbox: function () {
            var self = this;
            return this.connection.rpc('/hw_proxy/default_printer_action', {
                data: {
                    action: 'cashbox'
                }
            }).then(self._onIoTActionResult.bind(self))
                .guardedCatch(self._onIoTActionFail.bind(self));
        },

        /**
         * Sends the printing command the connected proxy
         * @param {String} img : The receipt to be printed, as an image
         */
        send_printing_job: function (img) {
            return this.connection.rpc('/hw_proxy/default_printer_action', {
                data: {
                    action: 'print_receipt',
                    receipt: img,
                }
            });
        },
    });

    return {
        PrinterMixin: PrinterMixin,
        Printer: Printer,
        PrintResult,
        PrintResultGenerator,
    }
});

var mercuryEnabled = true;
var mercuryLoggingEnabled = true;
var mercuryPrinterServerAddress = 'http://127.0.0.1:8091/';

function _mercuryMakeRequest(method, relativeUrlPath, isNeedStopOnFail, dataDictionary) {
    let url = mercuryPrinterServerAddress + relativeUrlPath;
    if (mercuryLoggingEnabled) {
        console.log("_mercuryMakeRequest" + method + ": " + url + " isNeedStopOnFail " + isNeedStopOnFail);
        if (dataDictionary)
            console.log("data: " + dataDictionary);
    }

    let promise = new Promise(function (resolve, reject) {
        if (!mercuryEnabled) {
            console.log("mercuryEnabled is false, skip request");
            resolve();
        } else {
            let xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (mercuryLoggingEnabled) {
                        console.log("_mercuryMakeRequest success: " + xhr.status);
                        console.log("_mercuryMakeRequest success data: " + xhr.response);
                    }

                    resolve(xhr.response);
                } else {
                    console.log("_mercuryMakeRequest error status: " + xhr.status + " " + xhr.statusText);
                    reject({
                        network_error: false,
                        status: xhr.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function () {
                console.log("_mercuryMakeRequest network error: " + xhr.status + " " + xhr.statusText);
                reject({
                    network_error: true,
                    status: xhr.status,
                    statusText: xhr.statusText
                });
            };
            if (dataDictionary) {
                xhr.setRequestHeader("Content-Type", "application/json");
                let data = JSON.stringify(dataDictionary);
                xhr.send(data);
            } else {
                xhr.send();
            }
        }
    });

    // return promise;
    return promise.catch((error) => {
        if (isNeedStopOnFail === true) {
            throw error;
        }
    });
}

function mercuryOpenCashBox(isNeedStopOnFail) {
    if (mercuryLoggingEnabled)
        console.log("mercuryOpenCashBox");

    return _mercuryMakeRequest('POST', 'openbox', isNeedStopOnFail);
}

function mercuryOpenSession(isNeedStopOnFail) {
    if (mercuryLoggingEnabled)
        console.log("mercuryOpenSession");

    return _mercuryMakeRequest('POST', 'opensession', isNeedStopOnFail);
}

function mercuryCloseSession(isNeedStopOnFail) {
    if (mercuryLoggingEnabled)
        console.log("mercuryCloseSession");

    return _mercuryMakeRequest('POST', 'closeshift', isNeedStopOnFail);
}

function mercuryPrintCheck(exportForPrintingData, isNeedStopOnFail) {
    if (mercuryLoggingEnabled)
        console.log("mercuryPrintCheck: " + exportForPrintingData);

    return _mercuryMakeRequest('POST', 'printcheck', isNeedStopOnFail, exportForPrintingData);
}

function mercuryCreateErrorPopupBody(error) {
    var title;
    let body = error.status + " " + error.statusText;

    if (error.network_error === true) {
        title = 'Программа принтера недоступна, проверьте, что она запущена';
    } else {
        title = 'Ошибка связи с принтером. Проверьте подключение принтера или перезагрузите программу Сервер Меркурия';
    }
    return {title: title, body: body};
}