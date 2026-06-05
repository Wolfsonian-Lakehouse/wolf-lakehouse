"use client";

import { useState, useEffect } from "react";

export function useCollection() {
  const [collection, setCollection] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wolfsonian_lakehouse_collection");
      if (saved) {
        setCollection(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load collection from localStorage", e);
    }
    setIsLoaded(true);
  }, []);

  const updateCollection = (newCollection: any[]) => {
    setCollection(newCollection);
    try {
      window.localStorage.setItem("wolfsonian_lakehouse_collection", JSON.stringify(newCollection));
    } catch (e) {
      console.error("Failed to save collection to localStorage", e);
    }
  };

  const addItem = (item: any) => {
    if (!isInCollection(item.field_identifier)) {
      updateCollection([...collection, item]);
    }
  };

  const removeItem = (identifier: string) => {
    updateCollection(collection.filter((i) => i.field_identifier !== identifier));
  };

  const clearCollection = () => {
    updateCollection([]);
  };

  const isInCollection = (identifier: string) => {
    return collection.some((i) => i.field_identifier === identifier);
  };

  const exportCsv = () => {
    if (collection.length === 0) return;
    
    // Using predefined set of important fields to keep export clean
    const headers = [
      "field_identifier", "title", "field_collection_type", "field_genre",
      "field_linked_agent", "field_edtf_date_created", "field_place_published",
      "field_physical_form", "field_extent", "field_subject", "source_system"
    ];
    
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    
    // Add rows
    for (const row of collection) {
      const values = headers.map(header => {
        const val = row[header];
        const escaped = (val === null || val === undefined) ? "" : String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lakehouse_collection_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    collection,
    isLoaded,
    addItem,
    removeItem,
    clearCollection,
    isInCollection,
    exportCsv
  };
}
