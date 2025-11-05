import { useState, useEffect } from 'react';
import { type EmailBox } from '@shared/schema';
import { nanoid } from 'nanoid';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'tempmail_email_boxes';

export function useEmailBoxes() {
  const [emailBoxes, setEmailBoxes] = useState<EmailBox[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setEmailBoxes(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to parse email boxes:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (user?.username) {
      const domain = 'antdev.org';
      const mainEmail = `${user.username.toLowerCase()}@${domain}`;
      
      const hasMainBox = emailBoxes.some(box => box.fullEmail === mainEmail);
      if (!hasMainBox) {
        const mainBox: EmailBox = {
          id: nanoid(),
          prefix: user.username.toLowerCase(),
          number: 0,
          domain,
          fullEmail: mainEmail,
          createdAt: Date.now(),
          messageCount: 0,
        };
        const updatedBoxes = [mainBox, ...emailBoxes];
        setEmailBoxes(updatedBoxes);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedBoxes));
      }
    }
  }, [user?.username]);

  const saveBoxes = (boxes: EmailBox[]) => {
    setEmailBoxes(boxes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boxes));
  };

  const generateRandomPrefix = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const getNextNumber = (prefix: string): number => {
    const boxesWithPrefix = emailBoxes.filter(box => box.prefix.toUpperCase() === prefix.toUpperCase());
    if (boxesWithPrefix.length === 0) return 1;
    const numbers = boxesWithPrefix.map(box => box.number);
    return Math.max(...numbers) + 1;
  };

  const createEmailBox = (prefix: string, domain: string, number?: number): EmailBox => {
    const normalizedPrefix = user?.username ? prefix.toLowerCase() : prefix.toUpperCase();
    const boxNumber = number !== undefined ? number : (user?.username ? getNextNumber(normalizedPrefix) : getNextNumber(normalizedPrefix));
    const fullEmail = user?.username 
      ? (boxNumber === 0 ? `${normalizedPrefix}@${domain}` : `${normalizedPrefix}${boxNumber}@${domain}`)
      : `${normalizedPrefix.toLowerCase()}${boxNumber}@${domain}`;
    
    const newBox: EmailBox = {
      id: nanoid(),
      prefix: normalizedPrefix,
      number: boxNumber,
      domain,
      fullEmail,
      createdAt: Date.now(),
      messageCount: 0,
    };

    const updatedBoxes = [...emailBoxes, newBox];
    saveBoxes(updatedBoxes);
    return newBox;
  };

  const createBoxWithRandomPrefix = (domain: string): EmailBox => {
    const prefix = generateRandomPrefix();
    return createEmailBox(prefix, domain);
  };

  const deleteEmailBox = (id: string) => {
    const updatedBoxes = emailBoxes.filter(box => box.id !== id);
    saveBoxes(updatedBoxes);
  };

  const updateBoxMessageCount = (fullEmail: string, count: number) => {
    const updatedBoxes = emailBoxes.map(box => 
      box.fullEmail === fullEmail ? { ...box, messageCount: count } : box
    );
    saveBoxes(updatedBoxes);
  };

  const createNumberedUserBox = (number: number): EmailBox | null => {
    if (!user?.username) return null;
    
    const domain = 'antdev.org';
    const prefix = user.username.toLowerCase();
    const fullEmail = number === 0 ? `${prefix}@${domain}` : `${prefix}${number}@${domain}`;
    
    const existingBox = emailBoxes.find(box => box.fullEmail === fullEmail);
    if (existingBox) return existingBox;
    
    return createEmailBox(prefix, domain, number);
  };

  const getUserEmailBoxes = (): EmailBox[] => {
    if (!user?.username) return emailBoxes;
    const prefix = user.username.toLowerCase();
    return emailBoxes.filter(box => box.prefix === prefix);
  };

  return {
    emailBoxes,
    createEmailBox,
    createBoxWithRandomPrefix,
    deleteEmailBox,
    updateBoxMessageCount,
    generateRandomPrefix,
    createNumberedUserBox,
    getUserEmailBoxes,
    isUserAuthenticated: !!user,
  };
}
