import { NativeModules } from 'react-native';
import type { Contact } from '@phonelink/shared';

interface PhoneActionsNative {
  getContacts(): Promise<Contact[]>;
  placeCall(number: string): Promise<boolean>;
  sendSms(number: string, body: string): Promise<boolean>;
}

const native = NativeModules.PhoneActions as PhoneActionsNative | undefined;
const unavailable = () => Promise.reject(new Error('PhoneActions unavailable'));

/** Address book, calling and texting, driven from the Mac's contacts page. */
export const PhoneActions = {
  getContacts: (): Promise<Contact[]> => native?.getContacts() ?? unavailable(),
  placeCall: (number: string): Promise<boolean> => native?.placeCall(number) ?? unavailable(),
  sendSms: (number: string, body: string): Promise<boolean> =>
    native?.sendSms(number, body) ?? unavailable(),
};
