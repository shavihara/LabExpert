import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, type = 'warning' }) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-12 h-12 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-12 h-12 text-red-500" />;
      case 'success':
        return <CheckCircle className="w-12 h-12 text-green-500" />;
      default:
        return <Info className="w-12 h-12 text-blue-500" />;
    }
  };

  const getButtonColors = () => {
    switch (type) {
      case 'warning':
        return {
          confirm: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
          cancel: 'bg-gray-300 hover:bg-gray-400 focus:ring-gray-500'
        };
      case 'error':
        return {
          confirm: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
          cancel: 'bg-gray-300 hover:bg-gray-400 focus:ring-gray-500'
        };
      default:
        return {
          confirm: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
          cancel: 'bg-gray-300 hover:bg-gray-400 focus:ring-gray-500'
        };
    }
  };

  const buttonColors = getButtonColors();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 sm:mx-0 sm:h-10 sm:w-10">
                {getIcon()}
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-headline">
                  {title}
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    {message}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${buttonColors.confirm}`}
              onClick={onConfirm}
            >
              Confirm
            </button>
            <button
              type="button"
              className={`mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 text-base font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm ${buttonColors.cancel}`}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;